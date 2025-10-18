/**
 * 抽象单例基类
 * 提供类型安全且线程安全的单例模式实现
 */
export abstract class Singleton {
  private static instances = new Map<string, Singleton>();

  /**
   * 获取单例实例
   * 子类需要重写此方法以返回正确的类型
   */
  protected static _getInstance<T extends Singleton>(ctor: new () => T): T {
    const className = ctor.name;
    
    if (!Singleton.instances.has(className)) {
      const instance = new ctor();
      Singleton.instances.set(className, instance);
      // 调用初始化方法
      instance.initialize();
    }
    
    return Singleton.instances.get(className) as T;
  }

  /**
   * 检查是否已存在实例
   */
  public static hasInstance(className: string): boolean {
    return Singleton.instances.has(className);
  }

  /**
   * 获取所有实例的类名
   */
  public static getInstanceNames(): string[] {
    return Array.from(Singleton.instances.keys());
  }

  /**
   * 重置所有实例（主要用于测试和清理）
   */
  public static resetAllInstances(): void {
    for (const [, instance] of Singleton.instances) {
      try {
        instance.dispose();
      } catch (error) {
        console.error(`清理实例时出错:`, error);
      }
    }
    Singleton.instances.clear();
  }

  /**
   * 移除特定实例
   */
  public static removeInstance(className: string): boolean {
    const instance = Singleton.instances.get(className);
    if (instance) {
      try {
        instance.dispose();
      } catch (error) {
        console.error(`清理实例 ${className} 时出错:`, error);
      }
      return Singleton.instances.delete(className);
    }
    return false;
  }

  /**
   * 构造函数 - 防止重复实例化
   */
  constructor() {
    const className = this.constructor.name;
    if (Singleton.instances.has(className)) {
      throw new Error(
        `单例类 ${className} 已存在实例。请使用 ${className}.getInstance() 获取实例。`
      );
    }
  }

  /**
   * 初始化方法 - 在实例创建后自动调用
   * 子类可以重写此方法进行初始化工作
   */
  protected initialize(): void {
    // 默认实现为空，子类可以重写
  }

  /**
   * 清理资源方法
   * 子类必须实现此方法来清理资源
   */
  public abstract dispose(): void;

  /**
   * 获取实例的类名
   */
  public getClassName(): string {
    return this.constructor.name;
  }

  /**
   * 检查实例是否已被销毁
   */
  public isDisposed(): boolean {
    return !Singleton.instances.has(this.constructor.name);
  }
}