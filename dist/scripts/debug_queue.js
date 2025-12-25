"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const bull_1 = require("bull");
function loadEnv() {
    try {
        const envPath = path.resolve(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            content.split('\n').forEach(line => {
                line = line.trim();
                if (!line || line.startsWith('#'))
                    return;
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            });
            console.log('.env loaded');
        }
        else {
            console.log('.env file not found at', envPath);
        }
    }
    catch (e) {
        console.log('Could not load .env', e);
    }
}
loadEnv();
async function check() {
    const redisConfig = process.env.REDIS_URL || {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
    };
    let queue;
    if (typeof redisConfig === 'string') {
        console.log('Connecting to Redis using URL');
        queue = new bull_1.default('aiQueue', redisConfig);
    }
    else {
        console.log('Connecting to Redis with config properties');
        queue = new bull_1.default('aiQueue', { redis: redisConfig });
    }
    try {
        console.log('Checking aiQueue...');
        const counts = await queue.getJobCounts();
        console.log('Job Counts:', JSON.stringify(counts, null, 2));
        const active = await queue.getActive();
        console.log(`Active Jobs: ${active.length}`);
        active.forEach(j => {
            console.log(` - Job ${j.id}: ${j.name}`);
            console.log(`   Data:`, JSON.stringify(j.data));
        });
        const waiting = await queue.getWaiting();
        console.log(`Waiting Jobs: ${waiting.length}`);
        waiting.forEach(j => console.log(` - Job ${j.id}: ${j.name}`));
        if (queue.getStalledCount) {
            const stalledCount = await queue.getStalledCount();
            console.log('Stalled jobs count:', stalledCount);
        }
        const isPaused = await queue.isPaused();
        console.log(`Is Paused: ${isPaused}`);
    }
    catch (err) {
        console.error('Error checking queue:', err);
    }
    finally {
        await queue.close();
    }
}
check();
//# sourceMappingURL=debug_queue.js.map