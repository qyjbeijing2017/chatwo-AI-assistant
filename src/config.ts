import { config } from 'dotenv';
import { expand } from 'dotenv-expand';
import { Singleton } from './utils/singleton';

/**
 * 配置管理单例
 */
export class Config extends Singleton {
  /**
   * 获取配置实例
   */
  public static getInstance(): Config {
    return super._getInstance(Config);
  }

  /**
   * 初始化配置
   */
  protected override initialize(): void {
    const myConfig = config();
    expand(myConfig);
    console.log('Configuration loaded:');
    console.log(process.env);
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    console.log('Config disposed');
  }

  /**
   * 获取字符串类型的配置值
   */
  public getText(key: string, defaultValue?: string): string {
    const value = process.env[key];
    return value !== undefined ? value : (defaultValue || '');
  }

  /**
   * 获取整数类型的配置值
   */
  public getInt(key: string, defaultValue?: number): number {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue || 0;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? (defaultValue || 0) : parsed;
  }

  /**
   * 获取浮点数类型的配置值
   */
  public getFloat(key: string, defaultValue?: number): number {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue || 0;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? (defaultValue || 0) : parsed;
  }
}