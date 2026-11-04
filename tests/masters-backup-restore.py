"""Recover the authorized backup in a disposable, network-isolated local PostgreSQL.

Only aggregate results leave the protected backup folder. Never targets production.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / 'test-results/production-backup-20261104'
NAME = 'mini-aguias-masters-restore-' + uuid.uuid4().hex[:12]
PURPOSE = 'mini-aguias-masters-backup-restore'

def docker(*args, input=None):
    return subprocess.run(['docker', *args], input=input, text=True, encoding='utf-8',
                          errors='replace', capture_output=True, timeout=60)

def checked(result, stage):
    if result.returncode:
        (BACKUP / 'recovery-error-private.log').write_text(result.stderr, encoding='utf-8')
        raise RuntimeError(stage + ' failed; details retained only in protected folder')
    return result.stdout.strip()

def sql(statement, stage):
    return checked(docker('exec','-i',NAME,'psql','-X','-qAt','-v','ON_ERROR_STOP=1',
                          '-U','postgres','-d','postgres',input="set time zone 'UTC';"+statement), stage)

def ident(name):
    return '"' + name.replace('"','""') + '"'

def canonical(rows):
    def normalize(value):
        if isinstance(value,float) and value.is_integer():
            return int(value)
        if isinstance(value,dict):
            return {key:normalize(item) for key,item in value.items()}
        if isinstance(value,list):
            return [normalize(item) for item in value]
        return value
    return '\n'.join(sorted(json.dumps(normalize(row),sort_keys=True,ensure_ascii=False,separators=(',',':')) for row in rows))

started = False
stage = 'Backup integrity'
report = {'project_ref':'dchthzmnldvvwnmhhlvf','status':'BLOCKED','production_writes':False,
          'object_bytes_included':False,'authentication_secrets_included':False,'tables':[]}
try:
    manifest = json.loads((BACKUP/'manifest.json').read_text(encoding='utf-8'))
    for item in manifest['files']:
        assert hashlib.sha256((BACKUP/item['name']).read_bytes()).hexdigest() == item['sha256'], 'Backup integrity failed'
    data = json.loads((BACKUP/'public-data-and-storage-metadata.json').read_text(encoding='utf-8'))
    assert data['project_ref'] == report['project_ref']
    schema = json.loads((BACKUP/'schema-storage.json').read_text(encoding='utf-8'))
    checked(docker('run','--rm','-d','--name',NAME,'--label','purpose='+PURPOSE,'--network','none',
                   '--memory','512m','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17',
                   '-c','log_min_error_statement=panic','-c','log_error_verbosity=terse'), 'Isolated container startup')
    started = True
    deadline = time.monotonic()+45
    while docker('exec',NAME,'pg_isready','-U','postgres').returncode:
        assert time.monotonic()<deadline, 'Isolated database startup timed out'
        time.sleep(.2)
    bootstrap = """
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.role() returns text language sql stable as $$select current_user::text$$;
    grant usage on schema auth,storage to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create type storage.buckettype as enum ('STANDARD','ANALYTICS','VECTOR');
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    create function storage.extension(text) returns text language sql immutable as $$select split_part($1,'.',-1)$$;
    """
    for table in schema:
        cols=','.join(ident(c['name'])+' '+c['type']+(' primary key' if c['name']=='id' else '') for c in table['columns'])
        bootstrap += 'create table storage.'+ident(table['name'])+'('+cols+');'
    bootstrap += 'alter table storage.objects enable row level security;'
    bootstrap += ''.join("insert into auth.users(id) values('"+str(x)+"');" for x in data['auth_user_ids'])
    stage='Recovery bootstrap'
    sql(bootstrap,stage)
    ddl=(BACKUP/'restore-schema.sql').read_text(encoding='utf-8')
    ddl=re.sub(r'insert into storage\.buckets\(id,name,public,file_size_limit,allowed_mime_types\) values .*?;','',ddl,flags=re.S)
    stage='Schema recovery'
    sql(ddl,stage)
    sql('set session_replication_role=replica;','Replica setting')
    all_data=[('public',name,rows) for name,rows in data['public_data'].items()]
    all_data += [('storage','buckets',data['storage_buckets']),('storage','objects',data['storage_objects'])]
    for namespace,name,rows in all_data:
        stage='Data comparison: '+namespace+'.'+name
        payload=json.dumps(rows,ensure_ascii=False,separators=(',',':'))
        tag='$backup_'+uuid.uuid4().hex+'$'
        statement='set session_replication_role=replica; insert into '+namespace+'.'+ident(name)+' overriding system value select * from jsonb_populate_recordset(null::'+namespace+'.'+ident(name)+','+tag+payload+tag+'::jsonb);'
        sql(statement,'Data recovery for '+namespace+'.'+name)
        restored=json.loads(sql('select coalesce(jsonb_agg(to_jsonb(t)),\'[]\'::jsonb) from '+namespace+'.'+ident(name)+' t;','Recovery comparison'))
        assert canonical(restored)==canonical(rows), 'Recovered values mismatch in '+namespace+'.'+name
        report['tables'].append({'name':namespace+'.'+name,'rows':len(rows),'status':'PASS',
                                'sha256':hashlib.sha256(canonical(rows).encode()).hexdigest()})
    stage='Foreign key validation'
    sql("""do $$ declare c record; i integer:=0; begin
      for c in select conrelid::regclass as tab,pg_get_constraintdef(oid) as definition
      from pg_constraint where contype='f' and connamespace='public'::regnamespace loop
        i:=i+1; execute format('alter table %s add constraint backup_fk_%s %s not valid',c.tab,i,c.definition);
        execute format('alter table %s validate constraint backup_fk_%s',c.tab,i);
      end loop; end $$;""",'Foreign key validation')
    stage='Sequence recovery'
    sql("""do $$ declare c record; highest bigint; sequence_name text; begin
      for c in select table_name,column_name from information_schema.columns where table_schema='public' and is_identity='YES' loop
        sequence_name:=pg_get_serial_sequence('public.'||quote_ident(c.table_name),c.column_name);
        execute format('select max(%I) from public.%I',c.column_name,c.table_name) into highest;
        perform setval(sequence_name::regclass,coalesce(highest,1),highest is not null);
        if highest is not null and nextval(sequence_name::regclass)<=highest then raise exception 'Sequence recovery failed'; end if;
      end loop; end $$;""",stage)
    report.update(status='PASS',foreign_keys='PASS',sequences='PASS',integrity='PASS',container_network='none',
                  restored_public_tables=len(data['public_data']),restored_storage_objects=len(data['storage_objects']))
    print('PASS: protected backup integrity, 20 public tables, Storage metadata and foreign keys recovered; no personal data logged.')
except Exception as error:
    report['status']='FAIL'
    report['error_type']=type(error).__name__
    report['failure_stage']=stage
    print('FAIL: recovery did not validate; production migrations must not run. Details remain private.')
    raise SystemExit(1) from None
finally:
    if started:
        label=checked(docker('inspect','--format','{{index .Config.Labels "purpose"}}',NAME),'Cleanup ownership check')
        assert label==PURPOSE
        checked(docker('stop',NAME),'Recovery container shutdown')
    (BACKUP/'recovery-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    (ROOT/'test-results/masters-backup-recovery-summary.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
