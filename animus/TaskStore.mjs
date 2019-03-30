import LiteEventEmitter from 'lite-ee';
import {default as fsCb} from 'fs';
import path from 'path';
import chokidar from 'chokidar';
const fs = fsCb.promises;

export default class AnimusTaskStore extends LiteEventEmitter {
  constructor({path}){
    super();
    this.path = path;
    this.manualAdditions = [];
    this.watcher = chokidar.watch(`${this.path}**/*.json`, {
      ignoreInitial: true
    });
    this.watcher.on('add', async filepath => {
      if(filepath.endsWith('.result.json') || filepath.endsWith('.error.json')) return;
      if(this.manualAdditions.includes(filepath)) return;
      this.emit('added', await this._getFromPath(filepath));
    })
  }
  async scan(scanRoot = null){
    if(scanRoot === null) scanRoot = this.path;

    let foundIncomplete = false;
    let fileNames = [];
    try{
      fileNames = await fs.readdir(scanRoot);
    } catch { return foundIncomplete; }

    await Promise.all(fileNames.map(async (fileName, index) => {
      if(!fileName.endsWith('.json')) return; // Ignore folders
      if(fileName.endsWith('.result.json') || fileName.endsWith('.error.json')) return; // Ignore results/errors
      if(fileNames[index+1] && (fileNames[index+1].endsWith('.result.json') || fileNames[index+1].endsWith('.error.json'))) return; // Ignore completed tasks

      const folderPath = path.join(scanRoot, path.basename(fileName, '.json'));
      const hasFolder = fsCb.existsSync(folderPath);
      const isBlocked = hasFolder && await this.scan(folderPath);
      if(!isBlocked) {
        this.emit('unblocked', await this._getFromPath(path.join(scanRoot, fileName)));
        foundIncomplete = true;
      }
    }));

    return foundIncomplete;
  }
  async _getFromPath(taskPath) {
    const content = await fs.readFile(taskPath, 'utf8');
    return JSON.parse(content);
  }
  async get(taskId){
    const basePath = path.join(this.path, taskId);
    return await this._getFromPath(basePath+'.json');
  }
  async add(task){
    const basePath = path.join(this.path, task.id);
    if(task.parentId) {
      const parentFolder = path.join(this.path, task.parentId);
      if(!fsCb.existsSync(parentFolder)) await fs.mkdir(parentFolder);
    }

    this.manualAdditions.push(basePath+'.json');
    await fs.writeFile(basePath+'.json', JSON.stringify(task), 'utf8');
    this.emit('added', task);
  }
  async getState(taskId){
    const basePath = path.join(this.path, taskId);
    const state = {};
    const hasFolder = fsCb.existsSync(basePath);
    if(!hasFolder) return state;

    const fileNames = await fs.readdir(basePath);
    await Promise.all(fileNames.map(async fileName => {
      const name = path.basename(fileName, '.json');
      if(name.endsWith('.result') || name.endsWith('.error')) {
        state[name.replace('.result','').replace('.error','')] = JSON.parse(await fs.readFile(path.join(basePath, fileName)));
      } else state[name] = undefined;
    }));

    return state;
  }
  async _checkParent(task){
    if(!task.parentId) return;
    const parentState = await this.getState(task.parentId);
    const hasIncompleteTasks = Object.values(parentState).some(x=>x === undefined);
    if(!hasIncompleteTasks) this.emit('unblocked', await this.get(task.parentId), parentState);
  }
  async finished(task, result){
    const basePath = path.join(this.path, task.id);
    await fs.writeFile(basePath+'.result.json', JSON.stringify(result), 'utf8');
    this._checkParent(task);
  }
  async failed(task, error){
    const basePath = path.join(this.path, task.id);
    await fs.writeFile(basePath+'.error.json', JSON.stringify(error), 'utf8');
    this._checkParent(task);
  }
}
