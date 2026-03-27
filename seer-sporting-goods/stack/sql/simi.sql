-- run as SYS
begin
    -- Allow all hosts for HTTP/HTTP_PROXY
   dbms_network_acl_admin.append_host_ace(
      host       => '*',
      lower_port => 11434,
      upper_port => 11434,
      ace        => xs$ace_type(
         privilege_list => xs$name_list(
            'http',
            'http_proxy'
         ),
         principal_name => upper('sh'),
         principal_type => xs_acl.ptype_db
      )
   );
end;
/



--load model into DB
begin
   dbms_vector.load_onnx_model(
      directory  => 'DEMO_PY_DIR',
      file_name  => 'all_MiniLM_L12_v2.onnx',
      model_name => 'demo_model'
   );
end;
/


-- create vector
drop table if exists products_vector;

create table products_vector
   as
      select p.prod_id,
             p.prod_name,
             p.prod_desc,
             p.prod_category_desc,
             p.prod_list_price,
             to_vector(dbms_vector_chain.utl_to_embedding(
                p.prod_desc,
                json(
                      '{"provider":"database", "model":"demo_model"}'
                   )
             )) as embedding
        from products p;


--Zebra query
select p.prod_desc,
       p.prod_category_desc,
       p.prod_list_price
  from products_vector p
 order by vector_distance(
   p.embedding,
   dbms_vector_chain.utl_to_embedding(
      'zebra',
      json(
            '{"provider":"database", "model":"demo_model"}'
         )
   ),
   cosine
)
 fetch approximate first 10 rows only;





 -- show also the distance

select p.prod_desc,
       p.prod_category_desc,
       p.prod_list_price,
       vector_distance(
          p.embedding,
          dbms_vector_chain.utl_to_embedding(
             'zebra',
             json(
                   '{"provider":"database", "model":"demo_model"}'
                )
          ),
          cosine
       ) as distance
  from products_vector p
 order by vector_distance(
   p.embedding,
   dbms_vector_chain.utl_to_embedding(
      'zebra',
      json(
            '{"provider":"database", "model":"demo_model"}'
         )
   ),
   cosine
)
 fetch first 10 rows only;



select *
  from products_vector;



--compare against Ollama
select p.prod_desc,
       p.prod_category_desc,
       p.prod_list_price,
       vector_distance(
          dbms_vector_chain.utl_to_embedding(
             p.prod_desc,
             json(
                   '{"provider":"ollama", "host": "local","url": "http://ollama:11434/api/embeddings", "model":"nomic-embed-text"}'
                )
          ),
          dbms_vector_chain.utl_to_embedding(
             'zebra',
             json(
                   '{"provider":"ollama", "host": "local","url": "http://ollama:11434/api/embeddings", "model":"nomic-embed-text"}'
                )
          ),
          cosine
       ) as distance
  from products_vector p
 order by vector_distance(
   dbms_vector_chain.utl_to_embedding(
      p.prod_desc,
      json(
            '{"provider":"ollama", "host": "local","url": "http://ollama:11434/api/embeddings", "model":"nomic-embed-text"}'
         )
   ),
   dbms_vector_chain.utl_to_embedding(
      'zebra',
      json(
            '{"provider":"ollama", "host": "local","url": "http://ollama:11434/api/embeddings", "model":"nomic-embed-text"}'
         )
   ),
   cosine
)
 fetch first 10 rows only;




 ---- or another one

select p.prod_desc,
       p.prod_category_desc,
       p.prod_list_price,
       vector_distance(
          dbms_vector_chain.utl_to_embedding(
             p.prod_desc,
             json(
                   '{"provider":"ollama", "host": "local","url": "http://ollama:11434/api/embeddings", "model":"snowflake-arctic-embed"}'
                )
          ),
          dbms_vector_chain.utl_to_embedding(
             'zebra',
             json(
                   '{"provider":"ollama", "host": "local","url": "http://ollama:11434/api/embeddings", "model":"snowflake-arctic-embed"}'
                )
          ),
          cosine
       ) as distance
  from products_vector p
 order by vector_distance(
   dbms_vector_chain.utl_to_embedding(
      p.prod_desc,
      json(
            '{"provider":"ollama", "host": "local","url": "http://ollama:11434/api/embeddings", "model":"snowflake-arctic-embed"}'
         )
   ),
   dbms_vector_chain.utl_to_embedding(
      'zebra',
      json(
            '{"provider":"ollama", "host": "local","url": "http://ollama:11434/api/embeddings", "model":"snowflake-arctic-embed"}'
         )
   ),
   cosine
)
 fetch first 10 rows only;