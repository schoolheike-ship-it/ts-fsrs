import { fsrs, createEmptyCard, Rating, type Card } from './packages/fsrs/src/index';
import * as fs from 'fs';

// ============ 数据结构 ============

interface ReviewLog {
  card_id: number;
  review_time: number;  // Unix timestamp (milliseconds)
  review_rating: number; // 1=Again, 2=Hard, 3=Good, 4=Easy
}

// ============ 自动保存并去重的存储类 ============

class FirstReviewStorage {
  private logs: Map<number, ReviewLog> = new Map(); // key = card_id
  private filePath: string;
  private autoSave: boolean;

  constructor(filePath: string = './first_reviews.json', autoSave: boolean = true) {
    this.filePath = filePath;
    this.autoSave = autoSave;
    this.load();
  }

  /**
   * 添加一条复习记录（自动只保留第一次）
   */
  add(card_id: number, review_time: number, review_rating: number): boolean {
    // 检查是否已存在
    const existing = this.logs.get(card_id);

    if (existing) {
      // 如果当前时间更早，则更新
      if (review_time < existing.review_time) {
        console.log(`⚠️  卡片 ${card_id} 发现更早的复习记录，更新为 ${new Date(review_time).toISOString()}`);
        this.logs.set(card_id, { card_id, review_time, review_rating });
        if (this.autoSave) this.save();
        return true;
      } else {
        console.log(`ℹ️  卡片 ${card_id} 已有更早的记录，跳过`);
        return false;
      }
    } else {
      // 新卡片，直接添加
      this.logs.set(card_id, { card_id, review_time, review_rating });
      if (this.autoSave) this.save();
      return true;
    }
  }

  /**
   * 批量添加（自动去重）
   */
  addBatch(logs: ReviewLog[]): number {
    let added = 0;
    for (const log of logs) {
      if (this.add(log.card_id, log.review_time, log.review_rating)) {
        added++;
      }
    }
    return added;
  }

  /**
   * 获取某张卡片的第一次复习记录
   */
  getFirst(card_id: number): ReviewLog | undefined {
    return this.logs.get(card_id);
  }

  /**
   * 获取所有第一次复习记录（按时间排序）
   */
  getAllSorted(): ReviewLog[] {
    const all = Array.from(this.logs.values());
    return all.sort((a, b) => a.review_time - b.review_time);
  }

  /**
   * 获取指定时间范围内的第一次复习
   */
  getByTimeRange(startTime: number, endTime: number): ReviewLog[] {
    return this.getAllSorted().filter(
      log => log.review_time >= startTime && log.review_time <= endTime
    );
  }

  /**
   * 保存到 JSON 文件
   */
  save(): void {
    const data = {
      version: '1.0',
      description: 'First review only (earliest time per card)',
      count: this.logs.size,
      logs: this.getAllSorted(),
    };
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  /**
   * 从 JSON 文件加载
   */
  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(content);

      if (data.logs && Array.isArray(data.logs)) {
        // 重新添加所有记录（会自动去重）
        data.logs.forEach((log: ReviewLog) => {
          this.add(log.card_id, log.review_time, log.review_rating);
        });
      }
    } catch (error) {
      console.error('Failed to load first reviews:', error);
    }
  }

  /**
   * 导出为 CSV（按时间排序）
   */
  exportToCSV(outputPath: string = './first_reviews.csv'): void {
    const logs = this.getAllSorted();
    const lines = ['card_id,review_time,review_rating'];

    logs.forEach(log => {
      lines.push(`${log.card_id},${log.review_time},${log.review_rating}`);
    });

    fs.writeFileSync(outputPath, lines.join('\n'));
    console.log(`✅ 导出 ${logs.length} 条第一次复习记录到 ${outputPath}`);
  }

  /**
   * 从完整的复习历史中提取第一次记录
   */
  static fromFullHistory(fullLogs: ReviewLog[]): FirstReviewStorage {
    const storage = new FirstReviewStorage();
    storage.autoSave = false; // 批量导入时关闭自动保存

    console.log(`📊 处理 ${fullLogs.length} 条完整复习记录...`);

    const added = storage.addBatch(fullLogs);

    console.log(`✅ 提取出 ${added} 张卡片的第一次复习记录`);
    console.log(`❌ 去重了 ${fullLogs.length - added} 条重复记录`);

    storage.autoSave = true;
    storage.save();

    return storage;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalCards: number;
    byRating: { [key: number]: number };
    timeRange: { earliest: number; latest: number } | null;
  } {
    const logs = this.getAllSorted();
    const byRating: { [key: number]: number } = {
      1: 0, 2: 0, 3: 0, 4: 0
    };

    logs.forEach(log => {
      byRating[log.review_rating] = (byRating[log.review_rating] || 0) + 1;
    });

    return {
      totalCards: logs.length,
      byRating,
      timeRange: logs.length > 0
        ? { earliest: logs[0].review_time, latest: logs[logs.length - 1].review_time }
        : null,
    };
  }

  /**
   * 清空所有记录
   */
  clear(): void {
    this.logs.clear();
    if (this.autoSave) this.save();
  }

  /**
   * 获取卡片总数
   */
  get size(): number {
    return this.logs.size;
  }
}

// ============ 集成 FSRS 的自动记录器 ============

class AutoReviewRecorder {
  private storage: FirstReviewStorage;
  private fsrs;
  private cards: Map<number, Card> = new Map();

  constructor(fsrsParams = {}, storagePath: string = './first_reviews.json') {
    this.fsrs = fsrs(fsrsParams);
    this.storage = new FirstReviewStorage(storagePath);
  }

  /**
   * 复习卡片并自动记录
   */
  review(card_id: number, now: Date | number, rating: number): Card {
    const timestamp = typeof now === 'number' ? now : now.getTime();

    // 获取或创建卡片
    let card = this.cards.get(card_id);
    if (!card) {
      card = createEmptyCard();
      this.cards.set(card_id, card);
    }

    // 执行复习
    const result = this.fsrs.next(card, new Date(timestamp), rating);

    // 自动记录（只保留第一次）
    this.storage.add(card_id, timestamp, rating);

    // 更新卡片
    this.cards.set(card_id, result.card);

    return result.card;
  }

  /**
   * 获取存储实例
   */
  getStorage(): FirstReviewStorage {
    return this.storage;
  }

  /**
   * 获取卡片
   */
  getCard(card_id: number): Card | undefined {
    return this.cards.get(card_id);
  }
}

// ============ 使用示例 ============

console.log('========== 自动保存第一次复习记录系统 ==========\n');

// 清理旧数据
if (fs.existsSync('./first_reviews.json')) fs.unlinkSync('./first_reviews.json');
if (fs.existsSync('./first_reviews.csv')) fs.unlinkSync('./first_reviews.csv');

console.log('【场景1】模拟多次复习，只保留第一次\n');

const storage = new FirstReviewStorage('./first_reviews.json');

// 卡片 100 的多次复习
console.log('卡片 100 的复习历史:');
storage.add(100, new Date('2021-01-03T10:00:00Z').getTime(), 3);  // 第3天
storage.add(100, new Date('2021-01-01T10:00:00Z').getTime(), 3);  // 第1天 ← 最早
storage.add(100, new Date('2021-01-02T10:00:00Z').getTime(), 3);  // 第2天

// 卡片 101 的复习
console.log('\n卡片 101 的复习历史:');
storage.add(101, new Date('2021-01-05T10:00:00Z').getTime(), 4);
storage.add(101, new Date('2021-01-04T10:00:00Z').getTime(), 3);  // ← 最早

// 卡片 102 的复习
console.log('\n卡片 102 的复习历史:');
storage.add(102, new Date('2021-01-02T12:00:00Z').getTime(), 2);

console.log('\n【结果】最终保留的记录（按时间排序）:\n');

const sorted = storage.getAllSorted();
sorted.forEach((log, i) => {
  const date = new Date(log.review_time);
  console.log(`${i + 1}. 卡片 ${log.card_id}: ${log.card_id},${log.review_time},${log.review_rating}`);
  console.log(`   时间: ${date.toISOString()} (UTC)`);
  console.log(`   评分: ${['', 'Again', 'Hard', 'Good', 'Easy'][log.review_rating]}`);
});

console.log('\n【场景2】从完整历史中提取第一次复习\n');

// 模拟完整的复习历史（包含重复）
const fullHistory: ReviewLog[] = [
  { card_id: 200, review_time: new Date('2021-01-01T10:00:00Z').getTime(), review_rating: 3 },
  { card_id: 200, review_time: new Date('2021-01-02T10:00:00Z').getTime(), review_rating: 3 },
  { card_id: 200, review_time: new Date('2021-01-05T10:00:00Z').getTime(), review_rating: 4 },
  { card_id: 201, review_time: new Date('2021-01-01T11:00:00Z').getTime(), review_rating: 3 },
  { card_id: 201, review_time: new Date('2021-01-03T10:00:00Z').getTime(), review_rating: 2 },
  { card_id: 202, review_time: new Date('2021-01-02T10:00:00Z').getTime(), review_rating: 4 },
  { card_id: 202, review_time: new Date('2021-01-04T10:00:00Z').getTime(), review_rating: 3 },
  { card_id: 203, review_time: new Date('2021-01-01T09:00:00Z').getTime(), review_rating: 3 },
];

console.log('原始历史记录:', fullHistory.length, '条');

const firstOnly = FirstReviewStorage.fromFullHistory(fullHistory);

console.log('\n提取结果:');
firstOnly.getAllSorted().forEach(log => {
  console.log(`  卡片 ${log.card_id}: ${new Date(log.review_time).toISOString()}`);
});

console.log('\n【场景3】集成 FSRS 自动记录\n');

const recorder = new AutoReviewRecorder({ enable_short_term: true }, './auto_first_reviews.json');

console.log('复习多个卡片:');

// 卡片 300 复习3次
recorder.review(300, new Date('2021-01-01T10:00:00Z'), Rating.Good);
recorder.review(300, new Date('2021-01-01T10:10:00Z'), Rating.Good);
recorder.review(300, new Date('2021-01-03T10:00:00Z'), Rating.Good);

// 卡片 301 复习2次
recorder.review(301, new Date('2021-01-02T10:00:00Z'), Rating.Hard);
recorder.review(301, new Date('2021-01-04T10:00:00Z'), Rating.Good);

console.log('\n自动保留的第一次记录:');
recorder.getStorage().getAllSorted().forEach(log => {
  console.log(`  卡片 ${log.card_id}: ${new Date(log.review_time).toISOString()}, 评分: ${log.review_rating}`);
});

console.log('\n【场景4】导出功能\n');

storage.exportToCSV('./first_reviews.csv');

console.log('\nCSV 文件内容:');
console.log(fs.readFileSync('./first_reviews.csv', 'utf-8'));

console.log('【场景5】统计信息\n');

const stats = storage.getStats();
console.log('统计信息:');
console.log({
  总卡片数: stats.totalCards,
  按评分分布: {
    Again: stats.byRating[1],
    Hard: stats.byRating[2],
    Good: stats.byRating[3],
    Easy: stats.byRating[4],
  },
  时间范围: stats.timeRange ? {
    最早: new Date(stats.timeRange.earliest).toISOString(),
    最晚: new Date(stats.timeRange.latest).toISOString(),
  } : null,
});

console.log('\n【场景6】时间范围查询\n');

const rangeStart = new Date('2021-01-01T00:00:00Z').getTime();
const rangeEnd = new Date('2021-01-02T23:59:59Z').getTime();

const inRange = storage.getByTimeRange(rangeStart, rangeEnd);
console.log(`2021-01-01 到 2021-01-02 之间的第一次复习: ${inRange.length} 条`);
inRange.forEach(log => {
  console.log(`  卡片 ${log.card_id}: ${new Date(log.review_time).toISOString()}`);
});

console.log('\n========== API 使用总结 ==========\n');

console.log(`
// 1. 创建存储（自动去重，只保留第一次）
const storage = new FirstReviewStorage('./first_reviews.json');

// 2. 添加复习记录（自动只保留最早的）
storage.add(100, Date.now(), 3);  // 自动判断是否是第一次
storage.add(100, Date.now(), 3);  // 如果不是第一次，自动忽略

// 3. 获取某卡片的第一次记录
const first = storage.getFirst(100);

// 4. 获取所有第一次记录（按时间排序）
const all = storage.getAllSorted();

// 5. 从完整历史提取第一次
const firstOnly = FirstReviewStorage.fromFullHistory(fullLogs);

// 6. 集成 FSRS 自动记录
const recorder = new AutoReviewRecorder();
recorder.review(card_id, now, rating);  // 自动记录第一次

// 7. 导出 CSV
storage.exportToCSV('./first_reviews.csv');

// 8. 统计
const stats = storage.getStats();
`);

console.log('\n========== 文件已生成 ==========');
console.log('✅ first_reviews.json - JSON 格式数据');
console.log('✅ first_reviews.csv - CSV 格式数据');
console.log('✅ auto_first_reviews.json - 自动记录的数据');
