#!/usr/bin/env python3
"""Destination first-boot installer. Secrets are fetched via instance identity."""
import base64,hashlib,ipaddress,json,os,pathlib,re,shutil,subprocess,sys,tarfile,tempfile,time,urllib.parse,urllib.request,zipfile
BASE=pathlib.Path('/opt/incidentdata')
# Historical UI snapshots are not runtime inputs. Older release archives contain
# dependency symlinks in these trees; ignore the trees without following links.
LEGACY_SOURCE_TREES={'adelaide_v2_tile_20260917','europe_profile_tiles_20260917'}

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def safe_path(root,name):
    relative=pathlib.PurePosixPath(name)
    if relative.is_absolute() or '..' in relative.parts:raise ValueError('Unsafe archive path')
    target=(root/str(relative)).resolve()
    if not target.is_relative_to(root.resolve()):raise ValueError('Archive escapes installation root')
    return target

def unpack_tar(archive,target):
    target.mkdir(parents=True,exist_ok=True)
    with tarfile.open(archive,'r:gz') as stream:
        for member in stream.getmembers():
            if pathlib.PurePosixPath(member.name).parts[0] in LEGACY_SOURCE_TREES:continue
            dest=safe_path(target,member.name)
            if member.isdir():dest.mkdir(parents=True,exist_ok=True)
            elif member.isfile():
                dest.parent.mkdir(parents=True,exist_ok=True)
                with stream.extractfile(member) as src,dest.open('wb') as out:shutil.copyfileobj(src,out)
                dest.chmod(member.mode&0o755)
            else:raise ValueError('Symlink or special file in release archive')

def unpack_zip(archive,target):
    target.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as stream:
        for item in stream.infolist():
            dest=safe_path(target,item.filename)
            if (item.external_attr>>16)&0o170000==0o120000:raise ValueError('Symlink in ZIP release')
            if item.is_dir():dest.mkdir(parents=True,exist_ok=True)
            else:
                dest.parent.mkdir(parents=True,exist_ok=True)
                with stream.open(item) as src,dest.open('wb') as out:shutil.copyfileobj(src,out)

def run(argv,log_name,*,timeout=None):
    with (BASE/'logs'/log_name).open('ab') as log:subprocess.run(argv,check=True,stdout=log,stderr=log,timeout=timeout)

def unit(name,argv):
    # No credentials are put in unit files or command arguments.
    if any('\n' in s for s in argv):raise ValueError('Invalid service argument')
    import shlex
    command=' '.join(shlex.quote(s) for s in argv)
    text='[Unit]\nAfter=network-online.target\nWants=network-online.target\n[Service]\nType=simple\nRestart=on-failure\nRestartSec=5\nExecStart='+command+'\n[Install]\nWantedBy=multi-user.target\n'
    pathlib.Path('/etc/systemd/system/'+name+'.service').write_text(text)
    run(['systemctl','daemon-reload'],'services.log');run(['systemctl','enable','--now',name],'services.log')

def release_path(name):
    # Shared release transport must never be used as a generic bucket reader.
    fixed={'release-manifest.json','application-source.tar.gz','bootstrap.tar.gz','acceptance-contract.json','baseline.json','ai/configuration.json','apex/manifest.json','tools/sqlcl.zip','database/manifest.json','database/security-baseline.json','database/export-audit.json','models/kokoro-v1.0.onnx','models/voices-v1.0.bin'}
    if not isinstance(name,str) or (name not in fixed and not re.fullmatch(r'(?:database/ID_RELEASE_[A-Z0-9]+_[A-Z0-9]+\.dmp|apex/f[0-9]+\.sql|associations/[A-Za-z0-9_-]+\.json)',name)):raise ValueError('Unapproved release artifact path')
    return name

def release_download_base(cfg):
    value=cfg.get('release_download_base_url','')
    if value=='':return ''
    if not isinstance(value,str) or len(value)>8192 or re.search(r'\s|[\x00-\x1f\x7f]',value):raise ValueError('Invalid release download location')
    parsed=urllib.parse.urlsplit(value)
    namespace=cfg['release_namespace'];bucket=cfg['release_bucket'];prefix=cfg['release_prefix'].strip('/')
    host=r'(?:'+re.escape(namespace)+r'\.objectstorage\.[a-z0-9-]+\.oci\.customer-oci\.com|objectstorage\.[a-z0-9-]+\.oraclecloud\.com)'
    expected=r'/p/[A-Za-z0-9_-]+/n/'+re.escape(namespace)+r'/b/'+re.escape(bucket)+r'/o/'+re.escape(prefix)+r'/'
    if urllib.parse.urlunsplit(parsed)!=value or parsed.scheme!='https' or not re.fullmatch(host,parsed.netloc) or parsed.query or parsed.fragment or not re.fullmatch(expected,parsed.path) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9/_-]*',prefix) or '..' in prefix or '//' in prefix:raise ValueError('Invalid release download location')
    return value

class NoReleaseRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ValueError('Release redirects are not allowed')

def release_response(client,cfg,name):
    release_path(name);base=release_download_base(cfg)
    if not base:return client.get_object(cfg['release_namespace'],cfg['release_bucket'],cfg['release_prefix'].rstrip('/')+'/'+name).data.raw
    try:return urllib.request.build_opener(NoReleaseRedirect()).open(urllib.request.Request(base+name,headers={'Accept-Encoding':'identity'}),timeout=120)
    except Exception:raise ValueError('Shared release download failed') from None

def release_manifest_bytes(client,cfg):
    with release_response(client,cfg,'release-manifest.json') as response:raw=response.read(16777217)
    if len(raw)>16777216:raise ValueError('Release manifest exceeds size limit')
    return raw

def download(client,cfg,name,entry,out):
    release_path(name)
    out.parent.mkdir(parents=True,exist_ok=True)
    if out.is_file() and digest(out)==entry['sha256'] and out.stat().st_size==entry['bytes']:return
    tmp=out.with_suffix(out.suffix+'.partial')
    with release_response(client,cfg,name) as response,tmp.open('wb') as f:
        os.chmod(tmp,0o600);received=0
        for chunk in iter(lambda:response.read(1024*1024),b''):
            received+=len(chunk)
            if received>entry['bytes']:raise ValueError('Release artifact exceeds declared size')
            f.write(chunk)
    if digest(tmp)!=entry['sha256'] or tmp.stat().st_size!=entry['bytes']:raise ValueError('Release artifact integrity failure')
    tmp.replace(out)

def checked_release_manifest(raw,cfg):
    if hashlib.sha256(raw).hexdigest()!=cfg['release_sha256']:raise ValueError('Release manifest checksum mismatch')
    manifest=json.loads(raw)
    if not isinstance(manifest,dict):raise ValueError('Release manifest must be an object')
    if manifest.get('status')!='candidate':raise ValueError('Release is not a verified test candidate')
    schema=database_manifest_entry(manifest)
    if manifest.get('database_encryption')=='AES256/password':
        if release_download_base(cfg):raise ValueError('Shared release transport requires a password-free release')
        checked_database_key_reference(manifest.get('database_key'),schema)
    elif manifest.get('database_encryption')=='NONE':
        if manifest.get('database_password_required') is not False or 'database_key' in manifest:raise ValueError('Password-free release must not contain key references')
        reference=manifest.get('database_export_audit')
        if not isinstance(reference,dict) or set(reference)!={'path','sha256','schema_manifest_sha256'} or reference.get('path')!='database/export-audit.json' or reference.get('schema_manifest_sha256')!=schema.get('sha256'):raise ValueError('Password-free export audit binding is required')
        entries=[e for e in manifest['artifacts'] if isinstance(e,dict) and e.get('path')==reference['path']]
        if len(entries)!=1 or entries[0].get('sha256')!=reference.get('sha256'):raise ValueError('Password-free export audit artifact mismatch')
        release_download_base(cfg)
    else:raise ValueError('Explicit AES-encrypted or password-free release is required')
    names=set()
    for entry in manifest['artifacts']:
        if not isinstance(entry,dict):raise ValueError('Invalid release artifact')
        name=release_path(entry.get('path'))
        if name in names or type(entry.get('bytes')) is not int or entry['bytes']<1 or not isinstance(entry.get('sha256'),str) or not re.fullmatch('[a-f0-9]{64}',entry['sha256']):raise ValueError('Invalid release artifact integrity contract')
        names.add(name)
    return manifest

def checked_export_audit(raw,manifest,schema_raw):
    reference=manifest['database_export_audit']
    if len(raw)>1048576 or hashlib.sha256(raw).hexdigest()!=reference['sha256']:raise ValueError('Export audit checksum mismatch')
    value=json.loads(raw)
    checks={'version':2,'status':'passed','manifestSha256':reference['schema_manifest_sha256'],'encryption':'NONE','encrypted':False,'passwordRequired':False,'dumpSetCanBeRead':True,'credentialCreationAbsent':True,'sourcePasswordHashesAbsent':True,'schedulerObjectsAbsent':True,'sourceApplicationRowsChanged':False}
    if not isinstance(value,dict) or any(type(value.get(k)) is not type(v) or value[k]!=v for k,v in checks.items()):raise ValueError('Password-free export privacy audit did not pass')
    if type(value.get('privateTablesEmpty')) is not int or not isinstance(value.get('privateTableNames'),list) or value['privateTablesEmpty']!=len(value['privateTableNames']):raise ValueError('Private table exclusion proof is missing')
    if hashlib.sha256(schema_raw).hexdigest()!=reference['schema_manifest_sha256']:raise ValueError('Schema manifest checksum mismatch')
    schema=json.loads(schema_raw)
    if schema.get('encryption')!='NONE' or schema.get('passwordRequired') is not False or schema.get('state')!='downloaded_not_restore_tested' or value.get('exportPrefix')!=schema.get('prefix') or value.get('exportedTables')!=schema.get('tables') or value.get('files')!=schema.get('files') or not isinstance(schema.get('excludedTableData'),list) or sorted(value['privateTableNames'])!=sorted(schema['excludedTableData']):raise ValueError('Export audit does not match the schema manifest')
    return value

def database_manifest_entry(manifest):
    if not isinstance(manifest.get('artifacts'),list):raise ValueError('Release artifacts are missing')
    entries=[entry for entry in manifest['artifacts'] if isinstance(entry,dict) and entry.get('path')=='database/manifest.json']
    if len(entries)!=1:raise ValueError('Exactly one database manifest artifact is required')
    return entries[0]

def checked_database_key_reference(reference,schema_entry):
    fields={'version','object','sha256','schema_manifest_sha256','export_prefix'}
    if not isinstance(reference,dict) or set(reference)!=fields or type(reference.get('version')) is not int or reference['version']!=1:raise ValueError('Invalid database key reference')
    if not isinstance(schema_entry,dict):raise ValueError('Invalid schema manifest artifact')
    schema_sha=schema_entry.get('sha256')
    if not isinstance(schema_sha,str) or not re.fullmatch('[a-f0-9]{64}',schema_sha):raise ValueError('Invalid schema manifest hash')
    if reference.get('schema_manifest_sha256')!=schema_sha:raise ValueError('Database key reference belongs to another schema manifest')
    if reference.get('object')!='release-keys/'+schema_sha+'/unlock.json':raise ValueError('Invalid database key object path')
    if not isinstance(reference.get('sha256'),str) or not re.fullmatch('[a-f0-9]{64}',reference['sha256']):raise ValueError('Invalid database key object hash')
    if not isinstance(reference.get('export_prefix'),str) or not re.fullmatch('ID_RELEASE_[A-Z0-9]+',reference['export_prefix']):raise ValueError('Invalid database export prefix')
    return reference

def checked_database_key(raw,reference,schema_entry):
    checked_database_key_reference(reference,schema_entry)
    if not isinstance(raw,bytes) or not 0<len(raw)<=4096:raise ValueError('Database key object exceeds its size limit')
    if hashlib.sha256(raw).hexdigest()!=reference['sha256']:raise ValueError('Database key object checksum mismatch')
    def unique_pairs(pairs):
        value={}
        for name,item in pairs:
            if name in value:raise ValueError('Duplicate database key field')
            value[name]=item
        return value
    try:value=json.loads(raw,object_pairs_hook=unique_pairs)
    except (ValueError,UnicodeError):raise ValueError('Database key object is not valid JSON') from None
    expected={'version','encryption','schema_manifest_sha256','export_prefix','dump_password'}
    if not isinstance(value,dict) or set(value)!=expected or type(value.get('version')) is not int or value['version']!=1 or value.get('encryption')!='AES256/password':raise ValueError('Invalid database key object format')
    if value.get('schema_manifest_sha256')!=reference['schema_manifest_sha256'] or value.get('export_prefix')!=reference['export_prefix']:raise ValueError('Database key object belongs to another export')
    key=value.get('dump_password')
    if not isinstance(key,str) or not re.fullmatch('[a-f0-9]{48}',key):raise ValueError('Invalid AES export key format')
    return key

def database_key(client,cfg,manifest):
    reference=checked_database_key_reference(manifest.get('database_key'),database_manifest_entry(manifest))
    # Private bucket-root object, deliberately not a downloadable release artifact.
    try:
        response=client.get_object(cfg['release_namespace'],cfg['release_bucket'],reference['object'])
        body=response.data
        try:
            length=response.headers.get('content-length')
            if length is not None and (not str(length).isdigit() or int(length)>4096):raise ValueError('Database key object exceeds its size limit')
            raw=body.raw.read(4097)
        finally:
            if hasattr(body,'close'):body.close()
    except Exception:raise ValueError('Private database key delivery failed') from None
    return checked_database_key(raw,reference,database_manifest_entry(manifest))

def write_private_config(path,value):
    if path.is_symlink():raise ValueError('Private config must not be a symlink')
    with tempfile.NamedTemporaryFile(dir=path.parent,prefix='.private-',delete=False) as out:
        os.fchmod(out.fileno(),0o600);out.write(json.dumps(value).encode());out.flush();os.fsync(out.fileno());temporary=pathlib.Path(out.name)
    temporary.replace(path)

def checked_credentials(raw,cfg):
    if len(raw)>1048576 or hashlib.sha256(raw).hexdigest()!=cfg['credentials_sha256']:raise ValueError('Bootstrap credential checksum mismatch')
    value=json.loads(raw)
    if value.get('deployment_id')!=cfg['deployment_id'] or value.get('release_sha256')!=cfg['release_sha256']:raise ValueError('Bootstrap credential identity mismatch')
    return value

def bootstrap_credentials(client,cfg,state):
    # A root-only cache supports retries after the cloud object has been retired.
    cache=state/'bootstrap-credentials.json'
    if cache.is_symlink():raise ValueError('Bootstrap cache must not be a symlink')
    if cache.exists():
        info=cache.stat()
        if info.st_uid!=os.getuid() or info.st_mode&0o077:raise ValueError('Bootstrap cache permissions are unsafe')
        return checked_credentials(cache.read_bytes(),cfg)
    response=client.get_object(cfg['status_namespace'],cfg['status_bucket'],cfg['credentials_object'])
    raw=response.data.content;value=checked_credentials(raw,cfg)
    with tempfile.NamedTemporaryFile(dir=state,prefix='.bootstrap-',delete=False) as out:
        os.fchmod(out.fileno(),0o600);out.write(raw);out.flush();os.fsync(out.fileno());temporary=pathlib.Path(out.name)
    temporary.replace(cache)
    return value

def retire_credentials(client,cfg):
    # Check content/ETag before deleting exactly the object for this deployment.
    try:response=client.get_object(cfg['status_namespace'],cfg['status_bucket'],cfg['credentials_object'])
    except Exception as error:
        if getattr(error,'status',None)==404:return
        raise
    checked_credentials(response.data.content,cfg)
    etag=response.headers.get('etag')
    if not etag:raise ValueError('Bootstrap credential ETag missing')
    client.delete_object(cfg['status_namespace'],cfg['status_bucket'],cfg['credentials_object'],if_match=etag)
    try:client.head_object(cfg['status_namespace'],cfg['status_bucket'],cfg['credentials_object'])
    except Exception as error:
        if getattr(error,'status',None)==404:return
        raise
    raise ValueError('Bootstrap credential object still exists after cleanup')

def deployment_readiness(cfg,private_config,release,instance_id):
    # A short readiness pass is never a full release-qualification receipt.
    passed=BASE/'state/deployment-readiness-passed.json'
    identity={'deployment_id':cfg['deployment_id'],'release_sha256':cfg['release_sha256'],'instance_id':instance_id,'verification':'deployment-readiness-v1'}
    receipt=release/'deployment-readiness.json'
    def valid_receipt():
        if not receipt.is_file():return False
        value=json.loads(receipt.read_text())
        return value.get('version')==2 and value.get('verificationMode')=='deployment' and value.get('deploymentId')==cfg['deployment_id'] and value.get('release')==cfg['release_sha256'] and value.get('releaseQualificationPassed') is False
    if passed.is_file() and json.loads(passed.read_text())==identity and valid_receipt():return
    # Hard process bound also covers a stalled connect/close; allow one minute
    # beyond the verifier's ten-minute check budget for connection cleanup.
    run(['node',str(BASE/'bootstrap/verify.cjs'),str(private_config),str(release),'deployment'],'readiness.log',timeout=660)
    if not valid_receipt():raise ValueError('Deployment readiness receipt is missing or belongs to another release/mode')
    passed.write_text(json.dumps(identity)+'\n');passed.chmod(0o600)

def main(config_file):
    import oci
    os.umask(0o077);cfg=json.loads(pathlib.Path(config_file).read_text())
    for folder in ['logs','release','state','state/rooms','state/transformers','state/caddy','state/caddy/data','state/caddy/config','state/ollama']:(BASE/folder).mkdir(parents=True,exist_ok=True)
    # The instance can boot before its narrowly scoped IAM policy propagates.
    signer=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
    client=oci.object_storage.ObjectStorageClient({'region':cfg['region']},signer=signer)
    request=urllib.request.Request('http://169.254.169.254/opc/v2/instance/id',headers={'Authorization':'Bearer Oracle'})
    instance_id=urllib.request.urlopen(request,timeout=10).read().decode().strip('"\n')
    def status(stage,state='running',error=None):
        record={'deployment_id':cfg['deployment_id'],'instance_id':instance_id,'release_sha256':cfg['release_sha256'],'stage':stage,'state':state,'updated_at':time.time()}
        if error:record['error']=error
        (BASE/'state/bootstrap-status.json').write_text(json.dumps(record)+'\n')
        client.put_object(cfg['status_namespace'],cfg['status_bucket'],cfg['status_object'],json.dumps(record).encode(),content_type='application/json')
    stage='release'
    try:
        for attempt in range(120):
            try:status(stage);break
            except oci.exceptions.ServiceError as error:
                if error.status not in [403,404,429] or attempt==119:raise
                time.sleep(5)
        data=release_manifest_bytes(client,cfg)
        manifest=checked_release_manifest(data,cfg)
        release=BASE/'release';(release/'release-manifest.json').write_bytes(data)
        for entry in manifest['artifacts']:
            name=entry['path'];out=safe_path(release,name)
            # Dump parts are fetched and hash-checked directly inside ADB.
            if name.startswith('database/') and name.endswith('.dmp'):continue
            download(client,cfg,name,entry,out)
        if manifest['database_encryption']=='NONE':checked_export_audit((release/'database/export-audit.json').read_bytes(),manifest,(release/'database/manifest.json').read_bytes())
        stage='credentials';status(stage)
        secret=bootstrap_credentials(client,cfg,BASE/'state')
        wallet=secret['wallet_base64']
        secret={k:v for k,v in secret.items() if k!='wallet_base64'}
        config={**cfg,**secret,'wallet_dir':str(BASE/'state/wallet'),'wallet_zip':str(BASE/'state/wallet.zip'),'sqlcl':'/opt/sqlcl/bin/sql','connect_string':cfg['database_name'].lower()+'_low'}
        config['release_base_uri']=release_download_base(cfg).rstrip('/') or 'https://objectstorage.'+cfg['region']+'.oraclecloud.com/n/'+cfg['release_namespace']+'/b/'+cfg['release_bucket']+'/o/'+cfg['release_prefix'].strip('/')
        if not config['database_name'].startswith('ID') or config['database_name'].upper().endswith(('FU40','FU30')):raise ValueError('Unexpected destination name')
        (BASE/'state/wallet.zip').write_bytes(base64.b64decode(wallet));unpack_zip(BASE/'state/wallet.zip',BASE/'state/wallet')
        # Terraform writes this non-secret object after the reserved IP attaches.
        # Looking it up by a known object key avoids a VM/public-IP dependency cycle.
        runtime=None
        for attempt in range(120):
            try:
                value=client.get_object(cfg['status_namespace'],cfg['status_bucket'],cfg['runtime_object']).data.content
                candidate=json.loads(value)
                if candidate['instance_id']!=instance_id or candidate['deployment_id']!=cfg['deployment_id']:raise ValueError('Runtime configuration identity mismatch')
                public_ip=str(ipaddress.ip_address(candidate['public_ip']))
                runtime=candidate;break
            except oci.exceptions.ServiceError as error:
                if error.status not in [403,404,429]:raise
            time.sleep(5)
        if runtime is None:raise ValueError('Reserved public IP configuration was not published')
        config['public_address']=cfg.get('public_hostname') or public_ip;config['public_origin']='https://'+config['public_address'];config['application_dir']=str(BASE/'app')
        config['schema_manifest_sha256']=next(e['sha256'] for e in manifest['artifacts'] if e['path']=='database/manifest.json')
        config['database_encryption']=manifest['database_encryption']
        if manifest['database_encryption']=='AES256/password':
            stage='database-key';status(stage)
            config['dump_password']=database_key(client,cfg,manifest)
            config['dump_key_export_prefix']=manifest['database_key']['export_prefix']
        else:
            config['database_export_audit']=manifest['database_export_audit']
        private_config=BASE/'state/bootstrap-private.json';write_private_config(private_config,config)
        stage='runtime';status(stage)
        stamp=BASE/'state/release.sha256'
        if stamp.exists() and stamp.read_text().strip()!=cfg['release_sha256']:raise ValueError('This VM belongs to another release; use a fresh stack')
        stamp.write_text(cfg['release_sha256']+'\n')
        app=BASE/'app';unpack_tar(release/'application-source.tar.gz',app)
        bootstrap=BASE/'bootstrap';unpack_tar(release/'bootstrap.tar.gz',bootstrap)
        unpack_zip(release/'tools/sqlcl.zip',pathlib.Path('/opt'));pathlib.Path('/opt/sqlcl/bin/sql').chmod(0o755)
        run(['npm','ci','--omit=dev','--prefix',str(bootstrap)],'bootstrap-dependencies.log')
        run(['podman','build','-f',str(app/'Containerfile'),'-t','localhost/incidentdata:release',str(app)],'app-build.log')
        run(['podman','build','-f',str(bootstrap/'Containerfile.detective-worker'),'-t','localhost/incidentdata-worker:release',str(app)],'worker-build.log')
        for phase in ['schema','security','ai']:
            stage=phase;status(stage);run(['node',str(bootstrap/'database.cjs'),phase,str(private_config),str(release)],phase+'.log')
        stage='apex';status(stage);run(['node',str(bootstrap/'apex.cjs'),str(private_config),str(release)],'apex.log')
        stage='accounts';status(stage);run(['node',str(bootstrap/'accounts.cjs'),str(private_config),str(app),str(BASE/'state/accounts.json')],'accounts.log')
        associations=release/'associations'
        if associations.is_dir():shutil.copytree(associations,BASE/'state/rooms/associations',dirs_exist_ok=True)
        env={'PORT':'3001','CRIMEDATA_BIND_HOST':'127.0.0.1','PUBLIC_DEMO_AUTH':'1','PUBLIC_DEMO_ORIGIN':config['public_origin'],'PUBLIC_DEMO_ACCOUNTS_FILE':'/state/accounts.json','FRONTEND_URL':config['public_origin'],'ORACLE_USER':'CRIME_DATA','APP_SCHEMA_PASSWORD':config['schema_password'],'ORACLE_CONNECTION_STRING':config['connect_string'],'ORACLE_WALLET_LOCATION':'/wallet','ORACLE_WALLET_PASSWORD':config['wallet_password'],'OCI_AUTH_MODE':'instance_principal','OCI_COMPARTMENT_ID':cfg['compartment_ocid'],'OCI_GENAI_REGION':cfg['genai_region'],'OCI_GENAI_MODEL':'meta.llama-3.3-70b-instruct','CDR_TEXT_MODEL':'google.gemini-2.5-flash','CDR_IMAGE_MODEL':'google.gemini-2.5-flash','CDR_AUDIO_MODEL':'google.gemini-2.5-flash','CDR_LEARNING_MODEL':'xai.grok-4.6','CDR_ROOM_MODEL':'meta.llama-4-maverick-17b-128e-instruct-fp8','CDR_ROOM_REGION':cfg['genai_region'],'CDR_ROOM_ENABLED':'1','CDR_ROOM_ROOT':'/rooms','OLLAMA_BASE_URL':'http://127.0.0.1:11434','OLLAMA_MODEL':'qwen2.5-coder:14b','TRANSFORMERS_CACHE':'/cache','XDG_CACHE_HOME':'/cache','HOME':'/tmp'}
        for value in env.values():
            if '\n' in value or '\r' in value:raise ValueError('Invalid runtime environment value')
        environment=BASE/'state/runtime.env';environment.write_text(''.join(k+'='+v+'\n' for k,v in env.items()));environment.chmod(0o600)
        common=['--rm','--network','host','--cap-drop=all','--security-opt=no-new-privileges','--read-only','--tmpfs','/tmp:rw,size=1g','--env-file',str(environment),'-v',str(BASE/'state/wallet')+':/wallet:ro,z','-v',str(BASE/'state/rooms')+':/rooms:rw,z','-v',str(BASE/'state/transformers')+':/cache:rw,z']
        unit('incidentdata-app',['/usr/bin/podman','run','--name','incidentdata-app',*common,'--memory=6g','-v',str(BASE/'state/accounts.json')+':/state/accounts.json:ro,z','localhost/incidentdata:release'])
        unit('incidentdata-worker',['/usr/bin/podman','run','--name','incidentdata-worker',*common,'--memory=12g','--entrypoint','/usr/bin/flock','-e','CDR_ROOM_WORKER_LOCKED=1','-e','CDR_ROOM_MODELS=/models','-e','CDR_ROOM_PUBLIC_ROOT=/public','-v',str(release/'models')+':/models:ro,z','-v',str(app/'frontend/public')+':/public:ro,z','localhost/incidentdata-worker:release','-n','/rooms/worker.lock','node','backend/detective-room-worker.js'])
        stage='ollama';status(stage)
        unit('incidentdata-ollama',['/usr/bin/podman','run','--rm','--name','incidentdata-ollama','--network','host','--memory=12g','-e','OLLAMA_HOST=127.0.0.1:11434','-v',str(BASE/'state/ollama')+':/root/.ollama:rw,z',cfg['ollama_image']])
        for attempt in range(60):
            try:run(['podman','exec','incidentdata-ollama','ollama','list'],'ollama.log');break
            except subprocess.CalledProcessError:time.sleep(5)
        run(['podman','exec','incidentdata-ollama','ollama','pull','qwen2.5-coder:14b'],'ollama-pull.log')
        stage='https';status(stage)
        run(['python3',str(bootstrap/'gateway.py'),'--address',config['public_address'],'--out',str(BASE/'state/Caddyfile')],'gateway.log')
        unit('incidentdata-gateway',['/usr/bin/podman','run','--rm','--name','incidentdata-gateway','--network','host','-v',str(BASE/'state/Caddyfile')+':/etc/caddy/Caddyfile:ro,z','-v',str(BASE/'state/caddy/data')+':/data:rw,z','-v',str(BASE/'state/caddy/config')+':/config:rw,z','docker.io/library/caddy:2.11.2'])
        stage='readiness';status(stage)
        deployment_readiness(cfg,private_config,release,instance_id)
        operator=next(a for a in config['participants'] if a.get('operator') and a['persona']=='statewide_admin')
        authorization=base64.b64encode((operator['username']+':'+operator['password']).encode()).decode()
        health=urllib.request.Request(config['public_origin']+'/api/health',headers={'Authorization':'Basic '+authorization})
        with urllib.request.urlopen(health,timeout=30) as response:
            if json.load(response).get('status')!='healthy':raise ValueError('Public application health check failed')
        stage='credential-cleanup';status(stage)
        retire_credentials(client,cfg)
        status('complete','ready')
    except Exception as error:
        # Never serialize SDK request objects, private config, SQL or credentials.
        code=getattr(error,'code',None) or type(error).__name__
        try:status(stage,'failed',str(code))
        finally:raise RuntimeError('Bootstrap failed in '+stage+' ('+str(code)+')') from None

if __name__=='__main__':
    try:main(sys.argv[1])
    except Exception as error:print(str(error),file=sys.stderr);raise SystemExit(1)
