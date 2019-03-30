import {default as fsCb} from 'fs';
import path from 'path';
const fs = fsCb.promises;

export default class AnimusToolStore {
  constructor({path, registryPath}){
    this.path = path;
    this.registryPath = registryPath;
    this.registry = {};
    this.cache = {};
  }
  async get(toolName){
    if(!this.cache[toolName]){
      const toolpath = '.'+this.path+toolName+'.mjs';
      this.cache[toolName] = (await import(toolpath)).default;
    }
    return this.cache[toolName];
  }
  getMetadata(toolName){
    return this.registry[toolName];
  }
  async loadRegistry(){
    const owners = await fs.readdir(this.registryPath);
    await Promise.all(owners.map(async owner => {
      const ownerPath = path.join(this.registryPath, owner)
      const fileNames = await fs.readdir(ownerPath);
      await Promise.all(fileNames.map(async fileName => {
        const content = await fs.readFile(path.join(ownerPath, fileName), 'utf8');
        const meta = JSON.parse(content);
        meta.name = `${owner}/${meta.name}`
        if(meta.requestFormat) meta.requestFormats = Object.values(meta.requestFormat);
        if(meta.responseFormat) meta.responseFormats = Object.values(meta.responseFormat);
        this.registry[meta.name] = meta;
      }));
    }));

    return Object.values(this.registry);
  }
  add(){}
}
