import test from "node:test";
import assert from "node:assert/strict";
const url=process.env.WORKER_URL;
test("deployed API health", {skip:!url}, async()=>{const r=await fetch(url.replace(/\/$/,"")+"/api/health");assert.equal(r.status,200);assert.equal((await r.json()).ok,true);});
