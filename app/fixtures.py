# Author: Prateek Dhall — World Dataset Assignment.
"""Small, isolated judge datasets seeded into separate read-only databases."""
COUNTRIES = [
 ('AAA','Aster','Asia','East',10000000,10000,2),
 ('BBB','Birch','Asia','East',8000000,50000,4),
 ('CCC','Cedar','Europe','West',600000001,20000,6),
 ('DDD','Dune','Europe','West',2000000,0,None),
 ('EEE','Elm','Africa','South',1000000,10000,7),
 ('FFF','Fir','Africa','South',0,50000,None),
 ('GGG','Grove','Oceania','Pacific',4000000,40000,9),
 ('HHH','Haven','Oceania','Pacific',2000000,10000,None),
 ('IND','India','Asia','Southern Asia',100000000,15000,14),
 ('USA','United States','North America','North America',300000000,50000,17),
]
CITIES = [(1,'Alpha','AAA',3000000),(2,'Beta','AAA',3000000),(3,'Small','AAA',1000000),
 (4,'Birch Capital','BBB',1000000),(5,'Birch Port','BBB',3000000),
 (6,'Cedar Capital','CCC',100),(7,'Elm Capital','EEE',600000),
 (8,'Grove Port','GGG',2000000),(9,'Grove Capital','GGG',1000000),
 (10,'Elm Port','EEE',100000),(11,'Twin','CCC',100),(12,'Zero','FFF',0)]
CITIES=[(*row,'') for row in CITIES]+[(13,'Mumbai','IND',5000000,'Maharashtra'),(14,'New Delhi','IND',4000000,'Delhi'),(15,'Los Angeles','USA',5000000,'California'),(16,'San Diego','USA',1000000,'California'),(17,'Washington','USA',900000,'District of Columbia')]
LANGUAGES = [('AAA','Hindi','T',40),('AAA','Urdu','T',40),('AAA','English','F',10),('AAA','French','T',10),
 ('BBB','English','T',50),('BBB','Hindi','F',25),('BBB','Urdu','F',25),
 ('CCC','French','T',25),('CCC','German','T',25),('CCC','Italian','T',25),('CCC','Spanish','T',25),
 ('EEE','Hindi','F',100),('GGG','English','F',50),('GGG','French','T',50),('IND','Hindi','T',50),('IND','Urdu','F',20),('IND','English','F',30),('USA','English','T',90)]

def fixture_rows(variant=0):
    countries=list(COUNTRIES)
    cities=list(CITIES)
    languages=list(LANGUAGES)
    if variant:
        countries=[(*r[:4],r[4]+(123456 if r[4] else 0),r[5],r[6]) for r in countries]
        cities=[(*r[:3],r[3]+(17 if r[3] else 0),r[4]) for r in cities]
        languages=[r for r in languages if not (r[0]=='BBB' and r[1]=='English')]
        languages.append(('DDD','English','T',100))
    return countries, cities, languages

def public_input(tables,variant=0):
    countries,cities,languages=fixture_rows(variant)
    data={
      'country':{'columns':['Code','Name','Continent','Region','Population','SurfaceArea','Capital'],'rows':countries},
      'city':{'columns':['ID','Name','CountryCode','Population','District'],'rows':cities},
      'countrylanguage':{'columns':['CountryCode','Language','IsOfficial','Percentage'],'rows':languages},
    }
    return {t:data[t] for t in tables}
