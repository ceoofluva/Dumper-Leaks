const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { processLuaFile } = require('./lua_runner_enhanced');
const path = require('path');
const os = require('os');

class ConcurrentProcessor {
    constructor(maxWorkers = os.cpus().length) {
        this.maxWorkers = Math.min(maxWorkers, os.cpus().length);
        this.workers = [];
        this.taskQueue = [];
        this.activeJobs = new Map();
        this.jobId = 0;
    }

    async initializeWorkers() {
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker(__filename, {
                workerData: { workerId: i }
            });
            
            worker.on('message', (result) => {
                this.handleWorkerMessage(worker, result);
            });
            
            worker.on('error', (error) => {
                console.error(`Worker ${i} error:`, error);
            });
            
            worker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`Worker ${i} stopped with exit code ${code}`);
                }
            });
            
            this.workers.push({
                worker,
                busy: false,
                workerId: i
            });
        }
    }

    handleWorkerMessage(workerObj, result) {
        const { jobId, success, data, error } = result;
        
        if (this.activeJobs.has(jobId)) {
            const { resolve, reject } = this.activeJobs.get(jobId);
            this.activeJobs.delete(jobId);
            
            // Mark worker as available
            const workerInfo = this.workers.find(w => w.worker === workerObj);
            if (workerInfo) {
                workerInfo.busy = false;
            }
            
            // Process next task in queue
            this.processNextTask();
            
            if (success) {
                resolve(data);
            } else {
                reject(new Error(error));
            }
        }
    }

    async processScript(scriptPath, scriptContent = null) {
        return new Promise((resolve, reject) => {
            const jobId = ++this.jobId;
            
            this.activeJobs.set(jobId, { resolve, reject });
            
            const task = {
                jobId,
                scriptPath,
                scriptContent,
                type: 'process'
            };
            
            this.taskQueue.push(task);
            this.processNextTask();
        });
    }

    processNextTask() {
        if (this.taskQueue.length === 0) return;
        
        const availableWorker = this.workers.find(w => !w.busy);
        if (!availableWorker) return;
        
        const task = this.taskQueue.shift();
        availableWorker.busy = true;
        
        availableWorker.worker.postMessage(task);
    }

    async shutdown() {
        
        // Wait for all active jobs to complete
        while (this.activeJobs.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Terminate all workers
        for (const workerInfo of this.workers) {
            workerInfo.worker.terminate();
        }
        
        this.workers = [];
    }

    getStats() {
        return {
            totalWorkers: this.maxWorkers,
            busyWorkers: this.workers.filter(w => w.busy).length,
            availableWorkers: this.workers.filter(w => !w.busy).length,
            queuedTasks: this.taskQueue.length,
            activeJobs: this.activeJobs.size
        };
    }
}

// Worker thread code
if (!isMainThread) {
    const { workerId } = workerData;
    
    parentPort.on('message', async (task) => {
        const { jobId, scriptPath, scriptContent, type } = task;
        
        try {
            if (type === 'process') {
                const result = await processLuaFile(scriptPath, scriptContent);
                parentPort.postMessage({
                    jobId,
                    success: true,
                    data: result,
                    workerId
                });
            }
        } catch (error) {
            parentPort.postMessage({
                jobId,
                success: false,
                error: error.message,
                workerId
            });
        }
    });
}

// Main thread exports
if (isMainThread) {
    module.exports = { ConcurrentProcessor };
}
