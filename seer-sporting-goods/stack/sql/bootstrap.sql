whenever sqlerror exit sql.sqlcode rollback
set define on
set verify off

define sh_password = '&1'
define connect_string = 'db:1521/FREEPDB1'

prompt === Preparing SH user ===
declare
    user_count number;
begin
    select count(*)
      into user_count
      from dba_users
     where username = 'SH';

    if user_count = 0 then
        execute immediate 'create user sh identified by "' || '&&sh_password' || '" quota unlimited on users';
    else
        execute immediate 'alter user sh identified by "' || '&&sh_password' || '" account unlock';
        execute immediate 'alter user sh quota unlimited on users';
    end if;
end;
/

grant create session, create table, create procedure, create sequence, create mining model to sh;
grant unlimited tablespace to sh;

create or replace directory DEMO_PY_DIR as '/opt/oracle/ext-models';
grant read, write on directory DEMO_PY_DIR to sh;

conn sh/"&&sh_password"@&&connect_string

prompt === Loading ONNX model ===
begin
    dbms_data_mining.drop_model(model_name => 'DEMO_MODEL');
exception
    when others then
        null;
end;
/

begin
    dbms_vector.load_onnx_model(
        directory  => 'DEMO_PY_DIR',
        file_name  => 'all_MiniLM_L12_v2.onnx',
        model_name => 'demo_model'
    );
end;
/

prompt === Rebuilding product catalog ===
begin
    execute immediate 'drop table products_vector purge';
exception
    when others then
        if sqlcode != -942 then
            raise;
        end if;
end;
/

begin
    execute immediate 'drop table products purge';
exception
    when others then
        if sqlcode != -942 then
            raise;
        end if;
end;
/

create table products (
    prod_id               number primary key,
    prod_name             varchar2(500 char),
    prod_desc             varchar2(4000 char),
    prod_subcategory      varchar2(500 char),
    prod_subcategory_id   number,
    prod_subcategory_desc varchar2(500 char),
    prod_category         varchar2(500 char),
    prod_category_id      number,
    prod_category_desc    varchar2(500 char),
    prod_weight_class     number,
    prod_unit_of_measure  varchar2(30 char),
    prod_pack_size        varchar2(30 char),
    supplier_id           number,
    prod_status           varchar2(30 char),
    prod_list_price       number(10, 2),
    prod_min_price        number(10, 2),
    prod_total            varchar2(30 char),
    prod_total_id         number,
    prod_src_id           number,
    prod_eff_from         date,
    prod_eff_to           date,
    prod_valid            varchar2(1 char)
);

@/workspace/sql/PRODUCTS.sql

commit;

create table products_vector as
    select p.prod_id,
           p.prod_name,
           p.prod_desc,
           p.prod_category_desc,
           p.prod_list_price,
           to_vector(
               dbms_vector_chain.utl_to_embedding(
                   p.prod_desc,
                   json('{"provider":"database", "model":"demo_model"}')
               )
           ) as embedding
      from products p;

commit;
