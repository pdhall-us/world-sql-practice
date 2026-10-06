# Author: Prateek Dhall — World Dataset Assignment.
"""Validate custom rows and expose them as parameterized, connection-local CTEs."""
from decimal import Decimal, InvalidOperation
import re
from fastapi import HTTPException

# Match the World table types. Fields omitted by the small example receive the
# same defaults as the canonical schema. No data is written to any table.
SCHEMA={
 'country':[
  ('Code','CHAR(3)','',3),('Name','CHAR(52)','',52),('Continent','CHAR(20)','Asia',20),
  ('Region','CHAR(26)','',26),('SurfaceArea','DECIMAL(10,2)',0,None),('IndepYear','SIGNED',None,None),
  ('Population','SIGNED',0,None),('LifeExpectancy','DECIMAL(3,1)',None,None),('GNP','DECIMAL(10,2)',None,None),
  ('GNPOld','DECIMAL(10,2)',None,None),('LocalName','CHAR(45)','',45),('GovernmentForm','CHAR(45)','',45),
  ('HeadOfState','CHAR(60)',None,60),('Capital','SIGNED',None,None),('Code2','CHAR(2)','',2)],
 'city':[('ID','SIGNED',None,None),('Name','CHAR(35)','',35),('CountryCode','CHAR(3)','',3),('District','CHAR(20)','',20),('Population','SIGNED',0,None)],
 'countrylanguage':[('CountryCode','CHAR(3)','',3),('Language','CHAR(30)','',30),('IsOfficial','CHAR(1)','F',1),('Percentage','DECIMAL(4,1)',0,None)],
}
NULLABLE={'country':{'IndepYear','LifeExpectancy','GNP','GNPOld','HeadOfState','Capital'},'city':set(),'countrylanguage':set()}
CONTINENTS={'Asia','Europe','North America','Africa','Oceania','Antarctica','South America'}

def fail(message):raise HTTPException(400,'Invalid testcase: '+message)

def validate(data):
 if not isinstance(data,dict) or set(data)!=set(SCHEMA):fail('Provide country, city, and countrylanguage tables.')
 result={}
 for table,definition in SCHEMA.items():
  block=data[table]
  if not isinstance(block,dict):fail(f'{table} must contain columns and rows.')
  columns=block.get('columns');rows=block.get('rows')
  allowed={c[0] for c in definition}
  if not isinstance(columns,list) or not columns or not all(isinstance(c,str) for c in columns):fail(f'{table}: columns must be a nonempty list of column names.')
  if len(set(columns))!=len(columns) or not set(columns)<=allowed:fail(f'{table}: duplicate or unknown columns.')
  required={'country':{'Code'},'city':{'ID','CountryCode'},'countrylanguage':{'CountryCode','Language'}}[table]
  if not required<=set(columns):fail(f'{table}: include '+', '.join(sorted(required))+'.')
  if not isinstance(rows,list) or len(rows)>100:fail(f'{table}: provide at most 100 rows.')
  normalized=[];keys=set()
  for index,row in enumerate(rows):
   if not isinstance(row,list) or len(row)!=len(columns):fail(f'{table} row {index+1}: expected {len(columns)} values.')
   source=dict(zip(columns,row));values=[]
   for name,type_,default,length in definition:
    value=source.get(name,default)
    if value is None:
     if name not in NULLABLE[table]:fail(f'{table}.{name} cannot be NULL.')
    elif length:
     if not isinstance(value,str) or len(value)>length:fail(f'{table}.{name} must be text of at most {length} characters.')
     if name=='Continent' and value not in CONTINENTS:fail('Continent must be a World dataset continent.')
     if name=='IsOfficial' and value not in ('T','F'):fail("IsOfficial must be 'T' or 'F'.")
    elif type_=='SIGNED':
     if isinstance(value,bool) or not isinstance(value,int):fail(f'{table}.{name} must be an integer.')
     low,high=(-32768,32767) if name=='IndepYear' else (-2147483648,2147483647)
     if not low<=value<=high:fail(f'{table}.{name} is outside its MySQL integer range.')
    else:
     if isinstance(value,bool) or not isinstance(value,(int,float,Decimal)):fail(f'{table}.{name} must be numeric.')
     try: number=Decimal(str(value))
     except InvalidOperation:fail(f'{table}.{name} must be numeric.')
     precision,scale=map(int,re.findall(r'\d+',type_))
     if not number.is_finite() or abs(number)>=10**(precision-scale) or number!=number.quantize(Decimal(10)**-scale):fail(f'{table}.{name} must fit {type_}.')
     value=str(number)
    values.append(value)
   names=[c[0] for c in definition];record=dict(zip(names,values))
   key=tuple(record[c] for c in ('CountryCode','Language')) if table=='countrylanguage' else (record['Code'] if table=='country' else record['ID'])
   # World uses a case-insensitive collation for character primary keys.
   key=tuple(v.casefold() if isinstance(v,str) else v for v in key) if isinstance(key,tuple) else key.casefold() if isinstance(key,str) else key
   if key in keys:fail(f'{table} row {index+1}: duplicate primary key.')
   keys.add(key);normalized.append(values)
  result[table]={'columns':columns,'rows':rows,'normalized':normalized}
 countries={r[0].casefold() for r in result['country']['normalized']}
 for table,column in [('city',2),('countrylanguage',0)]:
  if any(r[column].casefold() not in countries for r in result[table]['normalized']):fail(f'{table}.CountryCode must refer to a country in this testcase.')
 return result

def wrap(sql,data):
 validated=validate(data);ctes=[];params=[]
 for table,definition in SCHEMA.items():
  rows=validated[table]['normalized'];selects=[]
  for row in rows:
   selects.append('SELECT '+', '.join(f'CAST(%s AS {type_}) AS `{name}`' for name,type_,_,_ in definition));params.extend(row)
  if not rows:selects=['SELECT '+', '.join(f'CAST(NULL AS {type_}) AS `{name}`' for name,type_,_,_ in definition)+' WHERE 1=0']
  ctes.append(f'`{table}` AS ('+' UNION ALL '.join(selects)+')')
 body=re.sub(r'^WITH\s+','',sql,count=1,flags=re.I) if re.match(r'^WITH\b',sql,re.I) else sql
 if re.match(r'^WITH\b',sql,re.I):body=re.sub(r'^(?:\s|/\*[\s\S]*?\*/|--[^\n]*(?:\n|$)|#[^\n]*(?:\n|$))*','',body)
 prefix='WITH RECURSIVE ' if re.match(r'^RECURSIVE\b',body,re.I) else 'WITH '
 if prefix=='WITH RECURSIVE ':body=re.sub(r'^RECURSIVE\s+','',body,count=1,flags=re.I)
 separator=', ' if re.match(r'^WITH\b',sql,re.I) else ' '
 # PyMySQL interpolates placeholders when params are supplied, including percent
 # signs inside the original query; escape those while preserving data binding.
 return prefix+', '.join(ctes)+separator+body.replace('%','%%'),params
