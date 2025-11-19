import * as fs from 'fs';

interface ReviewLog {
  card_id: number;
  review_time: number;
  review_rating: number;
}

class FirstReviewStorage {
  private logs: Map<number, ReviewLog> = new Map();
  private filePath: string;

  constructor(filePath: string = './first_reviews.json') {
    this.filePath = filePath;
    this.load();
  }

  /**
   * 添加复习记录，自动只保留每个卡片的第一次（最早）记录
   */
  add(card_id: number, review_time: number, review_rating: number): void {
    const existing = this.logs.get(card_id);

    if (!existing || review_time < existing.review_time) {
      this.logs.set(card_id, { card_id, review_time, review_rating });
      this.save();
    }
  }

  /**
   * 获取所有第一次复习记录，按时间排序
   */
  getAllSorted(): ReviewLog[] {
    return Array.from(this.logs.values()).sort((a, b) => a.review_time - b.review_time);
  }

  /**
   * 导出为 CSV
   */
  exportToCSV(outputPath: string = './first_reviews.csv'): void {
    const logs = this.getAllSorted();
    const lines = ['card_id,review_time,review_rating'];

    logs.forEach(log => {
      lines.push(`${log.card_id},${log.review_time},${log.review_rating}`);
    });

    fs.writeFileSync(outputPath, lines.join('\n'));
  }

  /**
   * 保存到 JSON
   */
  private save(): void {
    const data = { logs: this.getAllSorted() };
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  /**
   * 从 JSON 加载
   */
  private load(): void {
    if (fs.existsSync(this.filePath)) {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      data.logs?.forEach((log: ReviewLog) => {
        this.logs.set(log.card_id, log);
      });
    }
  }
}

// 使用示例
const storage = new FirstReviewStorage();

// 添加复习记录
storage.add(100, 1609495200000, 3);  // 2021-01-01
storage.add(100, 1609581600000, 3);  // 2021-01-02 (自动忽略，已有更早的)
storage.add(101, 1609668000000, 4);  // 2021-01-03

// 导出
storage.exportToCSV('./first_reviews.csv');

// 获取结果
console.log(storage.getAllSorted());
