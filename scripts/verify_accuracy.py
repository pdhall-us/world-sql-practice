# Author: Prateek Dhall — World Dataset Assignment.
"""Independently verify all 30 SQL answers using Python, not reference SQL."""
import json
import os
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from urllib.request import Request, urlopen

BASE=os.getenv('BASE_URL','http://127.0.0.1:8080')
D=lambda x:Decimal(str(x))
round2=lambda x:D(x).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)

def api(path,data=None):
    req=Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
    with urlopen(req,timeout=20) as r:return json.load(r,parse_float=Decimal)

def run(sql,case,qid=1):return api('/api/run',{'question_id':qid,'sql':sql,'testcase':case})

def normalized(rows):
    return Counter(tuple(('n',D(v).normalize()) if isinstance(v,(int,float,Decimal)) else ('v',v) for v in r) for r in rows)

def verify(case):
    def records(table):
        result=run('SELECT * FROM '+table,case)
        return [dict(zip(result['columns'],row)) for row in result['rows']]
    countries=records('country');cities=records('city');languages=records('countrylanguage')
    country={c['Code']:c for c in countries}
    cc=defaultdict(list);cl=defaultdict(list)
    for c in cities:cc[c['CountryCode']].append(c)
    for l in languages:cl[l['CountryCode']].append(l)
    world=sum(c['Population'] for c in countries)
    expected={}
    estimates=defaultdict(Decimal)
    global_estimates=defaultdict(Decimal)
    for l in languages:
        c=country[l['CountryCode']]
        n=D(c['Population'])*D(l['Percentage'])/100
        estimates[c['Continent'],l['Language']]+=n
        global_estimates[l['Language']]+=n
    expected[11]=[]
    for (continent,language),n in estimates.items():
        rank=1+sum(v>n for (co,_),v in estimates.items() if co==continent)
        if rank<=3:expected[11].append([continent,language,round2(n),rank])
    expected[12]=[[c['Name'],len(cc[c['Code']])] for c in countries]
    expected[13]=[[c['Name'],l['Language'],l['Percentage'],max(x['Percentage'] for x in cl[c['Code']])] for c in countries for l in cl[c['Code']] if l['IsOfficial']=='T' and l['Percentage']<max(x['Percentage'] for x in cl[c['Code']])]
    expected[14]=[[c['Name'],ci['Name'],ci['Population']] for c in countries for ci in cc[c['Code']] if ci['Population']==max(x['Population'] for x in cc[c['Code']])]
    expected[15]=[[c['Name'],c['Population'],c['Continent']] for c in countries if not any(x['Population']>1000000 for x in cc[c['Code']])]
    regions=defaultdict(int)
    for c in countries:regions[c['Region']]+=c['Population']
    expected[16]=list(map(list,regions.items()))
    expected[17]=[[c['Name'],c['SurfaceArea'],c['Population'],round2(D(c['Population'])/c['SurfaceArea'])] for c in countries if 10000<=c['SurfaceArea']<=50000 and D(c['Population'])/c['SurfaceArea']>100]
    expected[18]=[[c['Name'],sum(l['IsOfficial']=='T' for l in cl[c['Code']])] for c in countries if sum(l['IsOfficial']=='T' for l in cl[c['Code']])>3]
    expected[19]=sorted(expected[12],key=lambda r:(-r[1],r[0]))[:5]
    averages={code:sum(D(x['Population']) for x in rows)/len(rows) for code,rows in cc.items() if rows}
    expected[20]=[[country[ci['CountryCode']]['Name'],ci['Name'],ci['Population'],round2(averages[ci['CountryCode']])] for ci in cities if ci['Population']>averages[ci['CountryCode']]]
    continents=defaultdict(int);english=set()
    for c in countries:continents[c['Continent']]+=c['Population']
    for l in languages:
        if l['Language']=='English' and l['IsOfficial']=='T':english.add(country[l['CountryCode']]['Continent'])
    expected[21]=[[co,pop] for co,pop in continents.items() if pop>500000000 and co not in english]
    city_by_id={ci['ID']:ci for ci in cities}
    expected[22]=[]
    for c in countries:
        cap=city_by_id.get(c['Capital'])
        if cap and c['Code'] in averages and cap['Population']<averages[c['Code']]:expected[22].append([c['Name'],cap['Name'],cap['Population'],round2(averages[c['Code']])])
    expected[23]=[[c['Name'],len({l['Language'] for l in cl[c['Code']]})] for c in countries]
    qualifying=sum(c['Population'] for c in countries if any(l['Language'] in ('Hindi','Urdu') for l in cl[c['Code']]))
    expected[24]=[[qualifying,world,round2(D(qualifying)*100/world)]]
    region_cities=defaultdict(list)
    for ci in cities:region_cities[country[ci['CountryCode']]['Region']].append(ci)
    expected[25]=[[region,ci['Name'],country[ci['CountryCode']]['Name'],ci['Population'],1+sum(x['Population']>ci['Population'] for x in rows)] for region,rows in region_cities.items() for ci in rows]
    expected[26]=[[l,round2(n),round2(n*100/world)] for l,n in sorted(global_estimates.items(),key=lambda pair:(-pair[1],pair[0]))[:5]]
    continent_ratios=defaultdict(list)
    for ci in cities:
        c=country[ci['CountryCode']]
        if c['SurfaceArea']>0:continent_ratios[c['Continent']].append((ci,c,D(ci['Population'])/c['SurfaceArea']))
    expected[27]=[[co,ci['Name'],c['Name'],ci['Population'],c['SurfaceArea'],round2(ratio)] for co,rows in continent_ratios.items() for ci,c,ratio in rows if ratio==max(r for _,_,r in rows)]
    no_english=[ci for ci in cities if not any(l['Language']=='English' and l['IsOfficial']=='T' for l in cl[ci['CountryCode']])]
    expected[28]=[[ci['Name'],country[ci['CountryCode']]['Name'],country[ci['CountryCode']]['Continent'],ci['Population']] for ci in sorted(no_english,key=lambda ci:(-ci['Population'],ci['Name'],country[ci['CountryCode']]['Name']))[:10]]
    expected[29]=[];expected[30]=[]
    for c in countries:
        rows=cc[c['Code']];top=sum(sorted([ci['Population'] for ci in rows],reverse=True)[:2])
        if len(rows)>=2 and c['Population']>0 and top*2>c['Population']:expected[29].append([c['Name'],c['Population'],top,round2(D(top)*100/c['Population'])])
        most=sorted(rows,key=lambda ci:(-ci['Population'],ci['Name']))[0]['Name'] if rows else None
        expected[30].append([c['Name'],c['Population'],len(rows),sum(l['IsOfficial']=='T' for l in cl[c['Code']]),most])
    expected[1]=[[c['Name']] for c in countries if c['Continent']=='Asia']
    expected[2]=[[ci['Name'],ci['Population']] for ci in sorted(cities,key=lambda ci:(-ci['Population'],ci['Name'],ci['ID']))[:5]]
    expected[3]=[[language] for language in sorted({l['Language'] for l in languages if l['IsOfficial']=='T' and country[l['CountryCode']]['Continent']=='Europe'})]
    expected[4]=[[ci['Name'],ci['Population']] for ci in cities if country[ci['CountryCode']]['Name']=='India']
    expected[5]=[[c['Name'],c['Population']] for c in countries if c['Population']>100000000]
    expected[6]=[[ci['Name']] for ci in cities if ci['District']=='California']
    expected[7]=[[continent,len([c for c in countries if c['Continent']==continent])] for continent in {c['Continent'] for c in countries}]
    expected[8]=[[c['Name'],c['SurfaceArea']] for c in sorted(countries,key=lambda c:(c['SurfaceArea'],c['Name']))[:10]]
    expected[9]=[[c['Name']] for c in countries if any(l['Language']=='English' and l['IsOfficial']=='T' for l in cl[c['Code']])]
    expected[10]=[[round2(sum(D(ci['Population']) for ci in cities)/len(cities)) if cities else None]]
    qs=json.loads((Path(__file__).resolve().parents[1]/'app/data/questions.json').read_text())
    for q in qs:
        sql=('CREATE VIEW country_summary AS ' if q['id']==30 else '')+q['reference_sql']
        actual=run(sql,case,q['id'])['rows']
        assert normalized(actual)==normalized(expected[q['id']]),f"Q{q['id']} differs from independent calculation on {case}: {normalized(actual)-normalized(expected[q['id']])}"
    print(f'{case}: all 30 answers match independent Python calculations')

if __name__=='__main__':
    verify('world')
    verify('example')
