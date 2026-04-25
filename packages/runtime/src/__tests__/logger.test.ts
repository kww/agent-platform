/**
 * logger.ts 测试
 */

import { Logger } from '../utils/logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: {
    log: jest.SpyInstance;
  };

  beforeEach(() => {
    logger = new Logger('debug');
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
  });

  describe('setLevel', () => {
    it('should change log level', () => {
      logger.setLevel('error');
      
      logger.info('should not log');
      expect(consoleSpy.log).not.toHaveBeenCalled();
      
      logger.error('should log');
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    it('should log when level is debug', () => {
      logger.debug('test message', { key: 'value' });
      
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0];
      expect(call[0]).toContain('[DEBUG]');
      expect(call[0]).toContain('test message');
    });

    it('should not log when level is info', () => {
      logger.setLevel('info');
      logger.debug('test message');
      
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log when level is info or lower', () => {
      logger.info('test message');
      
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0];
      expect(call[0]).toContain('[INFO]');
    });

    it('should not log when level is warn', () => {
      logger.setLevel('warn');
      logger.info('test message');
      
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log when level is warn or lower', () => {
      logger.setLevel('warn');
      logger.warn('test message');
      
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0];
      expect(call[0]).toContain('[WARN]');
    });

    it('should not log when level is error', () => {
      logger.setLevel('error');
      logger.warn('test message');
      
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should always log when level is error', () => {
      logger.setLevel('error');
      logger.error('test message');
      
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0];
      expect(call[0]).toContain('[ERROR]');
    });
  });

  describe('success', () => {
    it('should always log success', () => {
      logger.setLevel('error');
      logger.success('test message');
      
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0];
      expect(call[0]).toContain('[OK]');
    });
  });
});
