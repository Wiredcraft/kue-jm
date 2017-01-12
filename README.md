# kue-jm
[![Build Status](https://travis-ci.org/Wiredcraft/kue-jm.svg?branch=dev)](https://travis-ci.org/Wiredcraft/kue-jm)

  a J(ob) M(anager) tool for handling tasks(sub job) sequentially in Kue.js
 

## Installation
 `npm i`
 
 `npm test`
 
## Feature
 - Base on Kue.js
 - Support redis sentinel
 - Allow parent-child task design
 - Auto revert tasks to clean side efforts

## Examples
   if you want see more detail information, please set `DEBUG=jm:*` ;
   

## TODO
 - [X] implemented with event emitter.
 - [ ] support more job status query.
 - [ ] support more error handler.