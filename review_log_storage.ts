import { fsrs, createEmptyCard, Rating, type Card } from './packages/fsrs/src/index';
import * as fs from 'fs';
import * as path from 'path';

// ============ 数据结构 ============

/**
 * 简化的复习记录格式
 */
interface SimpleReviewLog {
  card_id: number;
  review_time: number;  // Unix timestamp (milliseconds)
  review_rating: number; // 1=Again, 2=Hard, 3=Good, 4=Easy
}

// ============ 存储类 ============

class ReviewLogStorage {
  private logs: Map<number, SimpleReviewLog[]> = new Map();
  private filePath: string;

  constructor(filePath: string = './review_logs.json') {
    this.filePath = filePath;
    this.load();
  }

  /**
   * 添加一条复习记录
   */
  add(card_id: number, review_time: number, review_rating: number): void {
    const log: SimpleReviewLog = {
      card_id,
      review_time,
      review_rating,
    };

    if (!this.logs.has(card_id)) {
      this.logs.set(card_id, []);
    }

    this.logs.get(card_id)!.push(log);
  }

  /**
   * 获取某张卡片的所有复习记录
   */
  getCardLogs(card_id: number): SimpleReviewLog[] {
    return this.logs.get(card_id) || [];
  }

  /**
   * 获取所有复习记录
   */
  getAllLogs(): SimpleReviewLog[] {
    const all: SimpleReviewLog[] = [];
    this.logs.forEach(logs => {
      all.push(...logs);
    });
    return all.sort((a, b) => a.review_time - b.review_time);
  }

  /**
   * 保存到 JSON 文件
   */
  save(): void {
    const data = {
      version: '1.0',
      logs: this.getAllLogs(),
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
        data.logs.forEach((log: SimpleReviewLog) => {
          this.add(log.card_id, log.review_time, log.review_rating);
        });
      }
    } catch (error) {
      console.error('Failed to load review logs:', error);
    }
  }

  /**
   * 导出为 CSV 格式
   */
  exportToCSV(outputPath: string = './review_logs.csv'): void {
    const logs = this.getAllLogs();
    const lines = ['card_id,review_time,review_rating'];

    logs.forEach(log => {
      lines.push(`${log.card_id},${log.review_time},${log.review_rating}`);
    });

    fs.writeFileSync(outputPath, lines.join('\n'));
  }

  /**
   * 从 CSV 导入
   */
  importFromCSV(inputPath: string): void {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`File not found: ${inputPath}`);
    }

    const content = fs.readFileSync(inputPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    // 跳过标题行
    for (let i = 1; i < lines.length; i++) {
      const [card_id, review_time, review_rating] = lines[i].split(',').map(Number);
      if (!isNaN(card_id) && !isNaN(review_time) && !isNaN(review_rating)) {
        this.add(card_id, review_time, review_rating);
      }
    }
  }

  /**
   * 清空所有记录
   */
  clear(): void {
    this.logs.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(card_id?: number): {
    totalReviews: number;
    byRating: { [key: number]: number };
    firstReview?: number;
    lastReview?: number;
  } {
    const logs = card_id !== undefined
      ? this.getCardLogs(card_id)
      : this.getAllLogs();

    const byRating: { [key: number]: number } = {
      1: 0, // Again
      2: 0, // Hard
      3: 0, // Good
      4: 0, // Easy
    };

    logs.forEach(log => {
      byRating[log.review_rating] = (byRating[log.review_rating] || 0) + 1;
    });

    return {
      totalReviews: logs.length,
      byRating,
      firstReview: logs.length > 0 ? logs[0].review_time : undefined,
      lastReview: logs.length > 0 ? logs[logs.length - 1].review_time : undefined,
    };
  }
}

// ============ 使用示例 ============

console.log('========== ReviewLog 存储系统示例 ==========\n');

// 创建存储实例
const storage = new ReviewLogStorage('./review_logs.json');

// 清空旧数据（演示用）
storage.clear();

// 模拟复习流程
const f = fsrs({ enable_short_term: true });
const cards = new Map<number, Card>();

// 创建卡片
const card_id = 100;
cards.set(card_id, createEmptyCard());

console.log('【示例1】添加复习记录\n');

// 第一次复习
let card = cards.get(card_id)!;
let now = new Date('2021-01-01T10:00:00Z');
let result = f.next(card, now, Rating.Good);

// 保存记录
storage.add(card_id, now.getTime(), Rating.Good);
cards.set(card_id, result.card);

console.log(`复习 #1: card_id=${card_id}, time=${now.getTime()}, rating=${Rating.Good}`);

// 第二次复习
card = cards.get(card_id)!;
now = new Date('2021-01-01T10:10:00Z');
result = f.next(card, now, Rating.Good);

storage.add(card_id, now.getTime(), Rating.Good);
cards.set(card_id, result.card);

console.log(`复习 #2: card_id=${card_id}, time=${now.getTime()}, rating=${Rating.Good}`);

// 第三次复习
card = cards.get(card_id)!;
now = new Date('2021-01-03T10:00:00Z');
result = f.next(card, now, Rating.Good);

storage.add(card_id, now.getTime(), Rating.Good);
cards.set(card_id, result.card);

console.log(`复习 #3: card_id=${card_id}, time=${now.getTime()}, rating=${Rating.Good}`);

console.log('\n【示例2】查询复习记录\n');

const cardLogs = storage.getCardLogs(card_id);
console.log(`卡片 ${card_id} 的复习记录 (${cardLogs.length} 条):`);
cardLogs.forEach((log, i) => {
  const date = new Date(log.review_time);
  console.log(`  ${i + 1}. ${log.card_id},${log.review_time},${log.review_rating} (${date.toISOString()})`);
});

console.log('\n【示例3】保存到文件\n');

// 保存为 JSON
storage.save();
console.log('✅ 保存到 JSON: ./review_logs.json');

// 导出为 CSV
storage.exportToCSV('./review_logs.csv');
console.log('✅ 导出到 CSV: ./review_logs.csv');

console.log('\n【示例4】CSV 文件内容预览\n');
const csvContent = fs.readFileSync('./review_logs.csv', 'utf-8');
console.log(csvContent);

console.log('\n【示例5】统计信息\n');

const stats = storage.getStats(card_id);
console.log('卡片统计:');
console.log({
  总复习次数: stats.totalReviews,
  Again: stats.byRating[1],
  Hard: stats.byRating[2],
  Good: stats.byRating[3],
  Easy: stats.byRating[4],
  首次复习: new Date(stats.firstReview!).toISOString(),
  最后复习: new Date(stats.lastReview!).toISOString(),
});

console.log('\n【示例6】从历史记录重建卡片状态\n');

// 读取历史记录
const history = storage.getCardLogs(card_id).map(log => ({
  rating: log.review_rating,
  review: new Date(log.review_time),
}));

// 使用 reschedule 重新计算
const rescheduleResult = f.reschedule(createEmptyCard(), history);

console.log('重建的卡片状态:');
const finalCard = rescheduleResult.collections[rescheduleResult.collections.length - 1].card;
console.log({
  stability: finalCard.stability,
  difficulty: finalCard.difficulty,
  reps: finalCard.reps,
  state: finalCard.state,
  scheduled_days: finalCard.scheduled_days,
});

console.log('\n========== 完整 API 使用示例 ==========\n');

console.log(`
// 1. 创建存储实例
const storage = new ReviewLogStorage('./review_logs.json');

// 2. 添加复习记录
storage.add(100, 1609459200000, 3);
storage.add(100, 1609459800000, 3);

// 3. 查询记录
const logs = storage.getCardLogs(100);
console.log(logs);
// [
//   { card_id: 100, review_time: 1609459200000, review_rating: 3 },
//   { card_id: 100, review_time: 1609459800000, review_rating: 3 }
// ]

// 4. 保存到文件
storage.save();  // JSON 格式
storage.exportToCSV('./logs.csv');  // CSV 格式

// 5. 从 CSV 导入
storage.importFromCSV('./logs.csv');

// 6. 获取统计
const stats = storage.getStats(100);

// 7. 清空数据
storage.clear();
`);

console.log('========== 数据库版本 (可选) ==========\n');

console.log(`
// 使用 SQLite
import Database from 'better-sqlite3';

const db = new Database('reviews.db');

// 创建表
db.exec(\`
  CREATE TABLE IF NOT EXISTS review_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    review_time INTEGER NOT NULL,
    review_rating INTEGER NOT NULL,
    INDEX idx_card_id (card_id),
    INDEX idx_review_time (review_time)
  )
\`);

// 插入记录
const insert = db.prepare(
  'INSERT INTO review_logs (card_id, review_time, review_rating) VALUES (?, ?, ?)'
);
insert.run(100, 1609459200000, 3);

// 查询记录
const query = db.prepare('SELECT * FROM review_logs WHERE card_id = ?');
const logs = query.all(100);
`);

console.log('\n========== 最小化实现版本 ==========\n');

console.log(`
// 如果只需要内存存储，最简单的实现：

const reviewLogs: Array<[number, number, number]> = [];

// 添加
reviewLogs.push([100, Date.now(), 3]);

// 查询某卡片
const cardLogs = reviewLogs.filter(log => log[0] === 100);

// 保存 CSV
const csv = reviewLogs.map(log => log.join(',')).join('\\n');
fs.writeFileSync('logs.csv', 'card_id,review_time,review_rating\\n' + csv);
`);
