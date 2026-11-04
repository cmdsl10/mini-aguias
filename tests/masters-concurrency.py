"""Real independent PostgreSQL connections; disposable local cluster, fake data only."""
import concurrent.futures
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
BIN = Path(os.environ.get('MASTERS_PG_BIN', 'C:/Program Files/PostgreSQL/17/bin'))
(ROOT / 'test-results').mkdir(exist_ok=True)
WORK = Path(tempfile.mkdtemp(prefix='masters-pg-', dir=ROOT / 'test-results'))
ADMIN = '00000000-0000-4000-8000-000000000001'
PLAYER = '10000000-0000-4000-8000-000000000001'
DOCKER = os.environ.get('MASTERS_PG_DOCKER') == '1'
CONTAINER = 'mini-aguias-masters-test-' + uuid.uuid4().hex[:12]

def docker(*args, input=None):
    return subprocess.run(['docker', *args], input=input, text=True, encoding='utf-8',
                          errors='replace', capture_output=True, timeout=45)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    PORT = sock.getsockname()[1]

def run(exe, *args, input=None):
    # Files prevent an inherited output pipe from hiding a startup timeout.
    with tempfile.TemporaryFile(mode='w+', encoding='utf-8', errors='replace') as out, tempfile.TemporaryFile(mode='w+', encoding='utf-8', errors='replace') as err:
        result = subprocess.run([str(BIN / (exe + '.exe')), *map(str, args)], input=input,
                                text=True, encoding='utf-8', errors='replace', stdout=out, stderr=err,
                                timeout=40, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        out.seek(0); err.seek(0)
        return subprocess.CompletedProcess(result.args, result.returncode, out.read(), err.read())

def sql(statement, actor=True):
    prefix = f"set role authenticated; set request.jwt.claim.sub='{ADMIN}'; set request.jwt.claims='{{\"app_metadata\":{{\"role\":\"admin\"}}}}';" if actor else ''
    if DOCKER:
        return docker('exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', input=prefix + statement)
    return run('psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', PORT,
               '-U', 'postgres', '-d', 'postgres', input=prefix + statement)

def ok(result):
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()

def payment(number, cents=100):
    return f"select masters_record_payment('20000000-0000-4000-8000-{number:012}', '{PLAYER}', {cents}, '[{{\"training_id\":\"{training}\",\"amount_cents\":{cents}}}]');"

def overlap(first, second):
    # Synchronize on a real held player lock rather than assuming startup timing.
    with concurrent.futures.ThreadPoolExecutor() as executor:
        one = executor.submit(sql, f"begin; select 1 from masters_players where id='{PLAYER}' for update; {first} select pg_sleep(5); commit;")
        deadline = time.monotonic() + 15
        while True:
            held = ok(sql("select count(*) from pg_stat_activity where wait_event='PgSleep' and pid<>pg_backend_pid();", False))
            if held != '0':
                break
            if one.done():
                ok(one.result())
                raise AssertionError('First transaction ended before overlap')
            assert time.monotonic() < deadline, 'Timed out waiting for held transaction'
            time.sleep(.05)
        two = executor.submit(sql, second)
        while True:
            waiting = ok(sql("select count(*) from pg_stat_activity where wait_event_type='Lock';", False))
            if waiting != '0':
                break
            assert not one.done(), 'No overlapping lock wait was observed'
            time.sleep(.05)
        return one.result(), two.result()

started = False
try:
    if DOCKER:
        ok(docker('run', '--rm', '-d', '--name', CONTAINER, '--label', 'purpose=mini-aguias-masters-test',
                  '--network', 'none', '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data',
                  '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17'))
        started = True
        deadline = time.monotonic() + 40
        while docker('exec', CONTAINER, 'pg_isready', '-U', 'postgres').returncode:
            assert time.monotonic() < deadline, 'Docker PostgreSQL startup timed out'
            time.sleep(.2)
    else:
        ok(run('initdb', '-D', WORK / 'data', '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C', '--no-sync'))
        ok(run('pg_ctl', '-D', WORK / 'data', '-l', WORK / 'server.log', '-o',
               f'-h 127.0.0.1 -p {PORT} -c fsync=off', '-w', 'start'))
        started = True
    fixture = (ROOT / 'tests/masters-db.cjs').read_text(encoding='utf-8')
    bootstrap = re.search(r'await db.exec\(`(create role anon;.*?)`\);', fixture, re.S).group(1)
    for name, value in [('admin', ADMIN), ('user', '00000000-0000-4000-8000-000000000002'), ('outsider', '00000000-0000-4000-8000-000000000003')]:
        bootstrap = bootstrap.replace('${ids.' + name + '}', value)
    ok(sql(bootstrap, False))
    ok(sql((ROOT / 'supabase/migrations/20261104125552_masters_private_training_management.sql').read_text(encoding='utf-8'), False))
    ok(sql(f"insert into masters_players(id,display_name,attendance_eligible) values('{PLAYER}','Membro fictício',true);"))
    training = ok(sql("select masters_create_training('2026-10-21');"))
    ok(sql("update masters_attendance set status='absent'; update masters_trainings set status='closed';"))
    results = overlap(payment(1), payment(2))
    ok(results[0])
    assert results[1].returncode != 0 and 'Absence over-allocation' in results[1].stderr, results[1].stderr
    assert ok(sql('select sum(amount_cents) from masters_payment_allocations;')) == '100'
    assert ok(sql('select count(*) from masters_payments;')) == '1'
    ok(sql("select masters_reverse_payment('20000000-0000-4000-8000-000000000001','Repor cenário fictício');"))
    results = overlap(payment(3), f"update masters_trainings set status='cancelled' where id='{training}';")
    ok(results[0])
    assert results[1].returncode != 0 and 'Reverse allocated payments' in results[1].stderr, results[1].stderr
    results = overlap('select 1;', f"update masters_attendance set status='present' where player_id='{PLAYER}' and training_id='{training}';")
    ok(results[0])
    assert results[1].returncode != 0 and 'Reverse allocated payments' in results[1].stderr, results[1].stderr
    assert ok(sql('select sum(amount_cents) from masters_payment_allocations;')) == '100'
    assert ok(sql('select status from masters_trainings;')) == 'closed'
    report = {'engine':'PostgreSQL 17, disposable local cluster', 'scenarios':[
        'Concurrent duplicate absence payment: one commit, one refusal, rollback without extra payment',
        'Concurrent payment and cancellation: cancellation refused after payment commit',
        'Attendance correction waiting for player lock: paid absence cannot become present'],
        'result':'PASS', 'remote_operations':False}
    (ROOT / 'test-results').mkdir(exist_ok=True)
    (ROOT / 'test-results/masters-concurrency.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('PASS: real PostgreSQL 17 independent connections; duplicate payment, payment/cancellation and locked attendance correction.')
finally:
    if started:
        if DOCKER:
            (WORK / 'server.log').write_text(docker('logs', CONTAINER).stderr, encoding='utf-8')
            assert ok(docker('inspect', '--format', '{{index .Config.Labels "purpose"}}', CONTAINER)) == 'mini-aguias-masters-test'
            ok(docker('stop', CONTAINER))
        else:
            ok(run('pg_ctl', '-D', WORK / 'data', '-m', 'immediate', '-w', 'stop'))
    print(f'Local cluster {"stopped" if started else "not started"}; evidence retained in {WORK}')
