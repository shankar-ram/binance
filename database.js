const dotenv=require("dotenv");
require('dotenv').config();
var mysql = require('mysql');
var con = mysql.createConnection({
    database:process.env.DATABASE,
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.PASSWORD,
    
  });
  
  con.connect(function(err) {
    if (err) throw err;
    console.log("Connected!");
  });


  module.exports=con;
  