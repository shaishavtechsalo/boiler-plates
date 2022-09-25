const os = require('os');
const redis = require('redis');
const axios = require('axios');
const cluster = require('cluster');
const express = require('express');
const sharedMemoryController = require('cluster-shared-memory');

require('dotenv').config();

const app = express();
app.use(express.json());


let redis_client = redis.createClient()
//  breaking
// let lock = require("redis-lock")(redis_client);

let lock_key = "lock_key";
let lock_val = 1;

const start = async () => {
    if (cluster.isMaster) 
    {
        const cores = os.cpus().length;
        for(let i=0;i<cores;i++) {
        cluster.fork();
        }

        cluster.on('exit', (worker, code, signal) => {
        console.log(`Killed Process ${worker.process.pid} with code ${code} and signal ${signal}`);
        cluster.fork();
        });
    
    } else {
        app.listen(3000, ()=>{console.log(`Started Server by ${process.pid} and Listening at http://localhost:3000`)});
        redis_client.connect();
        redis_client.on("connect", (err)=>{
            if(err) console.log(err);
            else console.log("Redis Connected");
        });
    }
  }
  
  start();


app.get('/github_data', async (req, res) => {
    const { username } = req.body;

    try{
        let cachedData = await redis_client.get(username);

        if(!cachedData){
            const url = `https://api.github.com/users/${username}`;
            const resp = await axios.get(url);
            cachedData = await addDataToRedis(username, resp.data);
        }
        res.status(200).send(JSON.parse(cachedData));
    }catch(err) {
        res.status(500).send({"message":`Invalid request for user ${username} with exception ${err.message}`});
    }
});

app.get('/update_data', async (req, res) => {
    lock_val = await redis_client.get(lock_key)
    if(parseInt(lock_val)){
        console.log(`Process ${process.pid} ${parseInt(lock_val)+1}`);
        redis_client.set(lock_key, parseInt(lock_val)+1);
    }
    res.send(lock_val).status(200);
})

async function addDataToRedis(key, data) {
    redis_client.set(key, JSON.stringify(data));
    cachedData = await redis_client.get(key);
    return cachedData;
}