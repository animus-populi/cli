import resolvePath from 'object-resolve-path';
import {default as fsCb} from 'fs';
import path from 'path';
const fs = fsCb.promises;

export default class AnimusDataStore {
  constructor({path}){
    this.path = path;
  }
  async get(location, owner = null){
    const i = location.indexOf('.');
    const source = location.substring(0, i);
    const objectPath = location.substring(i+1);
    if(owner === null) owner = source;

    const filepath = path.join(this.path, owner, source+'.json');
    const content = await fs.readFile(filepath, 'utf8');
    const object = JSON.parse(content);
    return resolvePath(object, objectPath);
  }
  set(){}
}
