-- Author: Prateek Dhall — World Dataset Assignment.
CREATE USER IF NOT EXISTS 'sql_runner'@'%' IDENTIFIED BY 'sql_runner_pw';
GRANT SELECT ON world.* TO 'sql_runner'@'%';
GRANT SELECT ON world_example.* TO 'sql_runner'@'%';
GRANT SELECT ON world_hidden.* TO 'sql_runner'@'%';
FLUSH PRIVILEGES;
