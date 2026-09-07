const assert = require('node:assert/strict');
const time = require('/tmp/opencut-core/utils/time.js');
const ops = require('/tmp/opencut-core/utils/timelineOps.js');
const base = {
  id:'c', trackId:'v', type:'video', mediaId:'m', timelineStart:5, timelineDuration:8, sourceStart:10, sourceDuration:8,
  playbackRate:1, transform:{x:0,y:0,scaleX:1,scaleY:1,rotation:0,anchorX:.5,anchorY:.5}, opacity:1, volume:1, muted:false,
  effects:{brightness:0,contrast:0,saturation:0,grayscale:0}, fadeIn:0, fadeOut:0
};
const wrap = c => [{id:'v',type:'video',name:'V',clips:[c],locked:false,muted:false,hidden:false,height:72}];
assert.equal(time.timeToPixels(2,80),160);
assert.equal(time.pixelsToTime(160,80),2);
let left = ops.trimLeft(wrap(base),'c',2,30)[0].clips[0];
assert.deepEqual([left.timelineStart,left.sourceStart,left.timelineDuration],[7,12,6]);
let split = ops.splitClip(wrap({...base,timelineStart:10,sourceStart:4,timelineDuration:10,sourceDuration:10}),'c',16,30).tracks[0].clips;
assert.equal(split.length,2);
let right = split.find(x=>x.id!=='c');
assert.deepEqual([right.timelineStart,right.sourceStart,right.timelineDuration],[16,10,4]);
assert.equal(time.sourceTimeForClip({...base,sourceStart:10,timelineStart:5,playbackRate:2},7),14);
assert.equal(time.snapTime(9.94,[10],.1).value,10);
console.log('core-smoke: 8 assertions passed');
