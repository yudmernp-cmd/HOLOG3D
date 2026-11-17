import {expect, it} from 'vitest';
import {trackingIsFresh} from './freshness';
it('accepts a just-received slow inference and expires an unresponsive worker', () => {
 const data={hands:[],width:640,height:480,timestamp:100,receivedAt:450};
 expect(trackingIsFresh(data,460)).toBe(true);
 expect(trackingIsFresh(data,951)).toBe(false);
});
