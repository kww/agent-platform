/**
 * events.ts 测试
 */

import { EventEmitter, Events } from '../core/events';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe('on', () => {
    it('should register event listener', () => {
      const handler = jest.fn();
      emitter.on('test', handler);
      
      emitter.emit('test', { data: 'hello' });
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'test',
        data: { data: 'hello' },
      }));
    });

    it('should support multiple listeners', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      emitter.on('test', handler1);
      emitter.on('test', handler2);
      
      emitter.emit('test', {});
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('once', () => {
    it('should only trigger once', () => {
      const handler = jest.fn();
      emitter.once('test', handler);
      
      emitter.emit('test', {});
      emitter.emit('test', {});
      
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    it('should remove listener', () => {
      const handler = jest.fn();
      emitter.on('test', handler);
      
      emitter.off('test', handler);
      emitter.emit('test', {});
      
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('should include timestamp', () => {
      const handler = jest.fn();
      emitter.on('test', handler);
      
      emitter.emit('test', {});
      
      const call = handler.mock.calls[0][0];
      expect(call.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners', () => {
      const handler = jest.fn();
      emitter.on('test', handler);
      
      emitter.removeAllListeners();
      emitter.emit('test', {});
      
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

describe('Events constants', () => {
  it('should have all event types', () => {
    expect(Events.WORKFLOW_STARTED).toBe('workflow.started');
    expect(Events.WORKFLOW_COMPLETED).toBe('workflow.completed');
    expect(Events.WORKFLOW_FAILED).toBe('workflow.failed');
    expect(Events.STEP_STARTED).toBe('step.started');
    expect(Events.STEP_COMPLETED).toBe('step.completed');
    expect(Events.STEP_FAILED).toBe('step.failed');
  });
});
