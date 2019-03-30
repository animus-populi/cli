import LiteEventEmitter from 'lite-ee';
import { DataStore, TaskStore, ToolStore } from './animus/index';
import { performance } from 'perf_hooks';
import rimraf from 'rimraf';

class RequestTask extends Error {
  constructor(task){
    super('Waiting for the completion of a task');
    this.task = task;
  }
}
function getTaskRequestWrapper({task, state}){
  return function(key, requestedTask){
    if(state[key]) return;
    requestedTask.id = `${task.id}/${key}`;
    requestedTask.parentId = task.id;

    throw new RequestTask(requestedTask);
  }
}

class Animus extends LiteEventEmitter {
  constructor(dataStore, taskStore, toolStore){
    super();
    this.taskStore = taskStore;
    this.toolStore = toolStore;
    this.dataStore = dataStore;
    this.toolStore.loadRegistry().then(registry => this._registerTools(registry));
  }
  _registerTools(registry){
    const tryAutomatedAgent = (task, state) => {
      let toolMeta;
      if(task.target && task.target.includes('/')) toolMeta = this.toolStore.getMetadata(task.target);
      else {
        toolMeta = registry.find(toolMeta => {
          // Determine if this tool should handle this task
          if(task.target && !toolMeta.name.startsWith(task.target)) return false;
          if(toolMeta['@type'] !== task['@type']) return false;
          if(task.requestFormat && (!toolMeta.requestFormats || !Object.values(task.requestFormat).every(x=>toolMeta.requestFormats.includes(x)))) return false;
          if(task.responseFormat && (!toolMeta.responseFormats || !Object.values(task.responseFormat).every(x=>toolMeta.responseFormats.includes(x)))) return false;

          return true;
        });
      }
      if(toolMeta) this._useTool(toolMeta, task, state);
    };

    this.taskStore.on('added', tryAutomatedAgent);
    this.taskStore.on('unblocked', tryAutomatedAgent);
    this.taskStore.scan();
  }
  addTask(task){
    return this.taskStore.add(task);
  }
  addTool(tool){
    this.toolStore.add(tool);
  }
  async _getTool(toolMeta, task, state = null) {
    const context = { task };

    if(toolMeta.state || toolMeta.tool || toolMeta.request)
      context.state = state || await this.taskStore.getState(task.id);

    if(toolMeta.request || toolMeta.tools)
      context.request = getTaskRequestWrapper(context);

    if(toolMeta.state) {
      await Promise.all(Object.keys(toolMeta.state).map(async key => {
        // TODO in the future this will need to be async and outside useTool
        // TODO handle the case where this data doesn't exist
        context.state[key] = await this.dataStore.get(toolMeta.state[key], task.requester);
      }));
    }

    if(toolMeta.tools){
      context.tools = {};

      Object.keys(toolMeta.tools).forEach(key => {
        const target = toolMeta.tools[key];
        // const toolMeta = this.toolStore.getMetadata(target);
        // if(toolMetadata.inline) tools[key] = this.toolStore.get(target);
        context.tools[key] = data => ({target, data});
      });
    }

    return async () => {
      const tool = await this.toolStore.get(toolMeta.name)
      return tool(context);
    }
  }
  async _useTool(toolMeta, task, state = null){
    this.emit('started', task, toolMeta);
    const toolRunner = await this._getTool(toolMeta, task, state);
    try{
      const result = await toolRunner() || null;
      this.taskStore.finished(task, result);
      this.emit('finished', task, toolMeta);
    } catch (exception) {
      if(exception instanceof RequestTask) {
        this.addTask(exception.task);
        this.emit('blocked', task, exception.task);
      } else {
        console.log(exception);
        this.taskStore.failed(task, exception);
        this.emit('failed', task, toolMeta, exception);
      }
    }
  }
}

const dataStore = new DataStore({
  path: './data/'
});
const taskStore = new TaskStore({
  path: './tasks/'
});
const toolStore = new ToolStore({
  path: './tools/',
  registryPath: './tools-registry/'
});

const setupDemo = () => {
  rimraf(taskStore.path+'*', () => {
    const animus = new Animus(dataStore, taskStore, toolStore);
    animus.addTask({
      "@context": "https://animus.dev/schema",
      "@type": "Shipping#Track",
      "id": "demo",
      "requester": "@zamplebox",
      "description": "Track shipment",
      "requestFormat": {
        "trackingNumber": "Shipment#TrackingNumber"
      },
      "data": {
        "trackingNumber": "1ZA275A00286321254"
      },
      "responseFormat": {
        "status": "Shipment#Status"
      }
    });
    setupPerf(animus);
  })
}

const setupPerf = (animus) => {
  let start, end;
  animus.on('started', (task) => {
    if(task.id === 'demo') start = performance.now();
  })
  animus.on('finished', (task) => {
    if(task.id === 'demo'){
      end = performance.now();
      console.log('took', end-start);
    }
  })
}

setupDemo();
