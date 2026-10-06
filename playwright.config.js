// Author: Prateek Dhall — World Dataset Assignment.
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({testDir:'./tests',timeout:45000,fullyParallel:false,workers:1,use:{baseURL:process.env.BASE_URL||'http://127.0.0.1:8080',browserName:'chromium',trace:'retain-on-failure'},reporter:[['list']],projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',testMatch:/ui\.spec\.js/,use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]});
