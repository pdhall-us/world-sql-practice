# Author: Prateek Dhall — World Dataset Assignment.
import json
import os
import re
import time
from collections import Counter
from decimal import Decimal
from pathlib import Path

import pymysql
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from app.fixtures import public_input
from app.custom_cases import wrap as wrap_custom

BASE = Path(__file__).parent
QUESTIONS = json.loads((BASE / 'data/questions.json').read_text())
Q = {x['id']: x for x in QUESTIONS}
app = FastAPI(title='World Dataset Assignment')
app.mount('/static', StaticFiles(directory=BASE / 'static'), name='static')

class Submission(BaseModel):
    question_id: int
    sql: str = Field(min_length=1, max_length=30000)
    testcase: str = 'world'
    custom_input: dict | None = None

def conn(fixture=None, cursorclass=pymysql.cursors.Cursor):
    return pymysql.connect(host=os.getenv('DB_HOST', 'db'), port=int(os.getenv('DB_PORT', '3306')),
        user=os.getenv('DB_USER', 'sql_runner'), password=os.getenv('DB_PASSWORD', 'sql_runner_pw'),
        database=('world_example' if fixture==0 else 'world_hidden') if fixture is not None else os.getenv('DB_NAME', 'world'), cursorclass=cursorclass,
        connect_timeout=5, read_timeout=6, write_timeout=6, autocommit=True, charset='utf8mb4')

# Lex strings and comments before checking keywords, so comments and literal text
# do not turn otherwise valid SQL into errors. MySQL executable comments are denied.
TOKEN = re.compile(r"'(?:[^'\\]|\\.|'')*'|\"(?:[^\"\\]|\\.|\"\")*\"|`(?:[^`]|``)*`|--(?=\s|$)[^\n]*|\#[^\n]*|/\*[\s\S]*?\*/|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|<=>|>=|<=|<>|!=|\|\||&&|:=|[A-Za-z_][A-Za-z_0-9]*|[^\s]", re.M)
BANNED = set('insert update delete drop alter truncate grant revoke load_file outfile dumpfile sleep benchmark information_schema performance_schema mysql sys into procedure get_lock release_lock release_all_locks is_free_lock is_used_lock for share lock unlock shutdown kill set use handler call do prepare execute deallocate'.split())

def safe_sql(sql, qid):
    if '/*!' in sql or '/*+' in sql:
        raise HTTPException(400, 'Executable comments and optimizer hints are not allowed.')
    tokens = []
    spans = []
    for m in TOKEN.finditer(sql):
        t=m.group()
        if t.startswith(('/*','--','#')): continue
        tokens.append(t)
        spans.append(m.span())
    if tokens and tokens[-1]==';':
        tokens.pop()
        spans.pop()
    if not tokens or ';' in tokens:
        raise HTTPException(400, 'Enter exactly one SQL statement.')
    if qid==30:
        names=[t.strip('`').lower() for t in tokens]
        replace_view=names[:3]==['create','or','replace']
        expected=['create','or','replace','view','country_summary','as'] if replace_view else ['create','view','country_summary','as']
        if names[:len(expected)]!=expected:
            raise HTTPException(400, 'Question 30 requires CREATE VIEW country_summary AS <SELECT ...>.')
        tokens=tokens[len(expected):]
        spans=spans[len(expected):]
    if not tokens or tokens[0].lower() not in ('select','with'):
        raise HTTPException(400, 'Only SELECT/CTE queries are allowed.')
    for i, token in enumerate(tokens[:-1]):
        if token.strip('`').lower() in ('world','world_example','world_hidden') and tokens[i+1]=='.':
            raise HTTPException(400, 'Use unqualified table names so your query can run against every test dataset.')
    words={t.strip('`').lower() for t in tokens if not t.startswith(("'",'"'))}
    if words & BANNED or '@' in tokens or ':=' in ''.join(tokens):
        raise HTTPException(400, 'That statement or function is not allowed in the practice runner.')
    return sql[spans[0][0]:spans[-1][1]]

def execute(sql, fixture=None, custom=None):
    params=None
    if custom is not None:sql,params=wrap_custom(sql,custom)
    started=time.perf_counter()
    with conn(fixture, pymysql.cursors.SSCursor) as c, c.cursor() as cur:
        cur.execute('SET SESSION MAX_EXECUTION_TIME=4000')
        cur.execute(sql,params)
        cols=[d[0] for d in cur.description] if cur.description else []
        rows=cur.fetchmany(5001)
    if len(rows)>5000: raise HTTPException(400, 'Result exceeds 5,000 rows. Refine your query.')
    return cols, list(rows), round((time.perf_counter()-started)*1000,1)

def norm(v):
    if isinstance(v,(int,float,Decimal)) and not isinstance(v,bool):
        return ('number',Decimal(str(v)).normalize())
    return ('null',) if v is None else ('text',str(v))

def canonical(rows):
    return Counter(tuple(norm(v) for v in r) for r in rows)

def matches(cols, rows, expected_cols, expected_rows, ordered=False):
    if [c.lower() for c in cols]!=[c.lower() for c in expected_cols]: return False
    if ordered:
        return [tuple(norm(v) for v in r) for r in rows]==[tuple(norm(v) for v in r) for r in expected_rows]
    return canonical(rows)==canonical(expected_rows)

def db_error(e):
    code=e.args[0] if e.args else None
    if isinstance(e,pymysql.err.OperationalError) and code in (2002,2003,2006,2013,1045):
        return HTTPException(503,'Database unavailable. Check that MySQL is running and the practice user is configured.')
    if code==3024:return HTTPException(400,'Time Limit Exceeded: query exceeded 4 seconds.')
    return HTTPException(400,e.args[1] if len(e.args)>1 else str(e))

@app.get('/')
def home(): return FileResponse(BASE/'static/index.html')

@app.get('/api/questions')
def questions(): return [{k:v for k,v in x.items() if k!='reference_sql'} for x in QUESTIONS]

@app.get('/api/schema')
def schema():
    try:
        with conn() as c, c.cursor() as cur:
            result={}
            for t in ('country','city','countrylanguage'):
                cur.execute(f'SHOW COLUMNS FROM `{t}`')
                result[t]=[{'name':r[0],'type':r[1],'nullable':r[2]=='YES','key':r[3]} for r in cur.fetchall()]
            return result
    except pymysql.MySQLError as e:raise db_error(e)

@app.get('/api/questions/{qid}/example')
def example(qid:int):
    if qid not in Q:raise HTTPException(404,'Question not found')
    try: cols,rows,_=execute(Q[qid]['reference_sql'],0)
    except pymysql.MySQLError as e:raise db_error(e)
    return {'input':public_input(Q[qid]['tables']),'custom_input':public_input(['country','city','countrylanguage']),'columns':cols,'rows':rows}

@app.get('/api/questions/{qid}/solution')
def solution(qid:int):
    if qid not in Q:raise HTTPException(404,'Question not found')
    sql=Q[qid]['reference_sql']
    sql=re.sub(r'\b(FROM|WHERE|LEFT JOIN|JOIN|GROUP BY|ORDER BY|HAVING|LIMIT)\b',r'\n\1',sql,flags=re.I)
    if qid==30:sql='CREATE VIEW country_summary AS\n'+sql
    return {'sql':sql}

@app.get('/api/health')
def health():
    try:
        _,rows,_=execute('SELECT (SELECT COUNT(*) FROM country),(SELECT COUNT(*) FROM city),(SELECT COUNT(*) FROM countrylanguage)')
        counts=rows[0]
        return {'ok':tuple(counts)==(239,4079,984),'country':counts[0],'city':counts[1],'countrylanguage':counts[2]}
    except pymysql.MySQLError:return {'ok':False,'error':'Database unavailable'}

def comparison_hint(cols,rows,expected_cols,expected_rows):
    if [c.lower() for c in cols]!=[c.lower() for c in expected_cols]:
        return 'Check the requested output column names and aliases.'
    if len(rows)!=len(expected_rows):
        return f'Expected {len(expected_rows)} rows, received {len(rows)}. Check joins, filters, and grouping.'
    return 'Check values, ties, NULL handling, and the required row order.'

@app.post('/api/run')
def run(x:Submission):
    if x.question_id not in Q:raise HTTPException(404,'Question not found')
    if x.testcase not in ('world','example','custom'):raise HTTPException(400,'Unknown test case')
    q=Q[x.question_id]
    sql=safe_sql(x.sql,x.question_id)
    if x.testcase=='custom' and x.custom_input is None:raise HTTPException(400,'Provide custom testcase input.')
    custom=x.custom_input if x.testcase=='custom' else None
    fixture=0 if x.testcase=='example' else None
    try:
        cols,rows,ms=execute(sql,fixture,custom)
        expected_cols,expected_rows,_=execute(q['reference_sql'],fixture,custom)
    except pymysql.MySQLError as e:raise db_error(e)
    accepted=matches(cols,rows,expected_cols,expected_rows,q.get('ordered',False))
    result={'columns':cols,'rows':rows,'row_count':len(rows),'runtime_ms':ms,'testcase':x.testcase,
        'accepted':accepted,'message':'Accepted' if accepted else 'Wrong Answer','passed':1 if accepted else 0,'total':1,
        'expected_columns':expected_cols,'expected_rows':expected_rows,'expected_row_count':len(expected_rows)}
    if not accepted:result['hint']=comparison_hint(cols,rows,expected_cols,expected_rows)
    return result

@app.post('/api/submit')
def submit(x:Submission):
    if x.question_id not in Q:raise HTTPException(404,'Question not found')
    q=Q[x.question_id]
    sql=safe_sql(x.sql,x.question_id)
    total=3
    runtime=0
    for index,fixture in enumerate((None,0,1)):
        try:
            cols,rows,ms=execute(sql,fixture)
            expected_cols,expected_rows,_=execute(q['reference_sql'],fixture)
        except pymysql.MySQLError as e:raise db_error(e)
        runtime+=ms
        if not matches(cols,rows,expected_cols,expected_rows,q.get('ordered',False)):
            hint=comparison_hint(cols,rows,expected_cols,expected_rows)
            return {'accepted':False,'message':'Wrong Answer','passed':index,'total':total,'runtime_ms':round(runtime,1),'row_count':len(rows),
                'testcase':['Official World dataset','Example dataset','Hidden edge cases'][index], 'hint':hint,
                'expected_columns':expected_cols,'your_columns':cols,'expected_preview':expected_rows[:20],'your_preview':rows[:20],
                'expected_row_count':len(expected_rows),'input':public_input(q['tables'],fixture) if fixture is not None else None}
    return {'accepted':True,'message':'Accepted','passed':total,'total':total,'runtime_ms':round(runtime,1),'row_count':len(rows)}
