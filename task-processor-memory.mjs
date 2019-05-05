//TODO don't store state on task, instead fetch if from children

import resolvePath from 'object-resolve-path';
import { performance } from 'perf_hooks';
import hash from 'object-hash';

// Mocks
const mockResponses = {
  'POST https://easypost.com/api/track': (req) => ({
    status: 'in_transit',
    carrier: 'USPS',
    url: 'https://easypost.com/dummy'
  }),
  'default': (req) => {}
}
const system = {
  tasks: {},
  data: {
    '@zamplebox': {
      '@easypost': {
        'account': {
          'key': "JleR1ZYkvqHi3cZk5IDqAQ"
        }
      }
    }
  },
  tools: {
    '@animus/fetch-data': path => resolvePath(system.data, path),
    '@animus/encode-base64': str => Buffer.from(str).toString('base64'),
    '@animus/http-post': request => {
      return (mockResponses['POST '+request.url] || mockResponses.default)(request);
    },
    '@easypost/track': {
      '@context': 'https://animus.dev/schema',
      '@type': 'Shipping#Track',
      name: 'track',
      requestFormat: {
        trackingNumber: 'Shipment#TrackingNumber'
      },
      responseFormat: {
        status: 'Shipment#Status',
        carrier: 'Shipment#Carrier',
        url: 'Shipment#TrackingPage'
      },
      tools: {
        encodeBase64: '@animus/encode-base64',
        httpPost: '@animus/http-post'
      },
      data: {
        account: "['@easypost'].account"
      },
      fn: ({task, state, tools: {encodeBase64, httpPost}}) => {
        state.encodedKey = encodeBase64(`${state.account.key}:`);
        state.response = httpPost({
          url: 'https://easypost.com/api/track',
          headers: {
            'Authentication': `Basic ${state.encodedKey}`
          },
          body: `tracker[tracking_code]=${task.trackingNumber}`
        });
      }
    }
  }
}

// Helpers
let taskId = 1;
const generateTaskId = () => taskId++;
const addTask = (task, parent = null, stateName = null) => {
  task.id = generateTaskId();
  task.status = 'pending';
  if(parent){
    task.parentId = parent.id;
    if(!parent.progress) parent.progress = [];
    parent.progress.push({
      taskId: task.id,
      status: 'pending',
      stateName
    });
  }
  system.tasks[task.id] = task;
  console.log('add task', task.description);
}
const updateParent = (task) => {
  const parent = system.tasks[task.parentId];
  const progress = parent.progress.find(x=>x.taskId === task.id);
  progress.status = task.status;
  if(task.status === 'complete'){
    if(!parent.state) parent.state = {};
    parent.state[progress.stateName] = task.result;
    if(!parent.progress.find(x=>x.status !== 'complete'))
      runTask(parent);
  }
}
const findQualifyingTool = (task) => {
  let toolKeys = Object.keys(system.tools).filter(x=>typeof system.tools[x] !== 'function');
  if(task.target) toolKeys = toolKeys.filter(x=>x.startsWith(task.target));

  const tools = toolKeys.map(x=>system.tools[x]).filter(tool => {
    if(tool['@type'] !== task['@type']) return false;
    if(task.requestFormat){
      const toolRequestFormats = Object.values(tool.requestFormat || {});
      if(!Object.values(task.requestFormat).every(x=>toolRequestFormats.includes(x))) return false;
    }
    if(task.responseFormat){
      const toolResponseFormats = Object.values(tool.responseFormat || {});
      if(!Object.values(task.responseFormat).every(x=>toolResponseFormats.includes(x))) return false;
    }
    return true;
  });

  if(tools.length !== 1) return null;
  return tools[0];
}
const runTask = async (task) => {
  let tool;
  if(task.target && task.target.includes('/')) tool = system.tools[task.target];
  else tool = findQualifyingTool(task);
  console.log('run task', task.description);
  start = performance.now();
  if(tool) useTool(tool, task);
}

// Processor
class RequestTask extends Error {
  constructor(task, stateName){
    super('Waiting for the completion of a task');
    this.task = task;
    this.stateName = stateName;
  }
}
const toolWrapper = (toolKey, state, task) => {
  return function(data){
    const stateName = hash({toolKey, data});
    if(state[stateName]) return state[stateName];

    throw new RequestTask({
      target: toolKey,
      data,
      description: `${toolKey} op for ${task.id}`
    }, stateName);
  }
}
const useTool = (tool, task) => {
  task.status = 'in-progress';
  let processor;
  if(typeof tool === 'function') {
    processor = () => tool(task.data);
  } else {
    const state = task.state || {};
    if(tool.data){
      Object.keys(tool.data).filter(key => !state[key]).forEach(key => {
        // TODO in the future this will need to be async and outside useTool
        // TODO handle the case where this data doesn't exist
        state[key] = system.tools['@animus/fetch-data'](`['${task.requester}']${tool.data[key]}`);
      });
    }

    const tools = {};
    if(tool.tools){
      Object.keys(tool.tools).forEach(key => {
        tools[key] = system.tools[tool.tools[key]] || toolWrapper(tool.tools[key], state, task);
      });
    }

    const toolContext = { task, state, tools };
    processor = () => tool.fn(toolContext);
  }

  try {
    task.result = processor();
    task.status = 'complete';
    if(task.description === demoTask.description){
      const finish = performance.now();
      console.log('took', finish-start);
    }
    console.log('task complete', task.description);
    if(task.parentId) updateParent(task);
  } catch (exception) {
    if(exception instanceof RequestTask) {
      addTask(exception.task, task, exception.stateName);
      runTask(exception.task);
    } else {
      task.status = 'failed';
      console.log('task failed', task.description);
      throw exception;
    }
  }
}

// Demo Task
const demoTask = {
  '@context': 'https://animus.dev/schema',
  '@type': 'Shipping#Track',
  requester: '@zamplebox',
  description: 'Track shipment',
  requestFormat: {
    trackingNumber: 'Shipment#TrackingNumber'
  },
  data: {
    trackingNumber: '1ZA275A00286321254'
  },
  responseFormat: {
    status: 'Shipment#Status'
  }
};
addTask(demoTask);
let start = performance.now();
runTask(demoTask);
