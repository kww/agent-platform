/**
 * 语言注册测试
 */

import { 
  codeRegisterLanguageHandler, 
  getLanguageConfig, 
  detectLanguage,
  listSupportedLanguages 
} from '../core/builtin-handlers';

describe('Language Registry', () => {
  test('should list supported languages', () => {
    const languages = listSupportedLanguages();
    
    expect(languages.length).toBeGreaterThan(20);
    expect(languages).toContain('typescript');
    expect(languages).toContain('python');
    expect(languages).toContain('go');
    expect(languages).toContain('rust');
    expect(languages).toContain('java');
  });
  
  test('should get language config', () => {
    const tsConfig = getLanguageConfig('typescript');
    
    expect(tsConfig).toBeDefined();
    expect(tsConfig.extensions).toContain('.ts');
    expect(tsConfig.extensions).toContain('.tsx');
    expect(tsConfig.features).toContain('functions');
    expect(tsConfig.features).toContain('classes');
  });
  
  test('should detect language from file path', () => {
    expect(detectLanguage('src/index.ts')).toBe('typescript');
    expect(detectLanguage('src/App.tsx')).toBe('typescript');
    expect(detectLanguage('main.py')).toBe('python');
    expect(detectLanguage('main.go')).toBe('go');
    expect(detectLanguage('lib.rs')).toBe('rust');
    expect(detectLanguage('Main.java')).toBe('java');
    expect(detectLanguage('App.cs')).toBe('csharp');
    expect(detectLanguage('index.html')).toBe('html');
    expect(detectLanguage('styles.css')).toBe('css');
    expect(detectLanguage('config.yml')).toBe('yaml');
  });
  
  test('should return undefined for unknown extension', () => {
    expect(detectLanguage('file.xyz')).toBeUndefined();
  });
});

describe('Code Register Language Handler', () => {
  test('should register new language', async () => {
    const result = await codeRegisterLanguageHandler({
      language: 'newlang',
      extensions: ['.nl', '.newlang'],
    });
    
    expect(result.success).toBe(true);
    expect(result.registered).toBe(true);
    expect(result.language_config.extensions).toContain('.nl');
    expect(result.supported_features).toBeDefined();
  });
  
  test('should update existing language', async () => {
    // 先注册
    await codeRegisterLanguageHandler({
      language: 'testlang',
      extensions: ['.tl'],
    });
    
    // 再更新
    const result = await codeRegisterLanguageHandler({
      language: 'testlang',
      extensions: ['.tl2'],
    });
    
    expect(result.success).toBe(true);
    expect(result.language_config.extensions).toContain('.tl');
    expect(result.language_config.extensions).toContain('.tl2');
  });
  
  test('should register with custom patterns', async () => {
    const result = await codeRegisterLanguageHandler({
      language: 'custom',
      parser_config: {
        function: [/func\s+(\w+)/g],
        class: [/struct\s+(\w+)/g],
      },
    });
    
    expect(result.success).toBe(true);
    expect(result.supported_features).toContain('function');
    expect(result.supported_features).toContain('class');
  });
  
  test('should handle case insensitivity', async () => {
    const result = await codeRegisterLanguageHandler({
      language: 'PYTHON',  // 大写
    });
    
    expect(result.success).toBe(true);
    // 应该更新已有的 python 配置
    expect(result.message).toContain('updated');
  });
});
