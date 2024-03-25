import { Context, Schema } from 'koishi'

export const name = 'signin'

export interface Config { }

export const Config: Schema<Config> = Schema.object({


})


declare module 'koishi' {
  interface Tables {
    bind: Schedule
  }
}

export interface Schedule {
  pid: number
  aid: number
}

declare module 'koishi' {
  interface Tables {
    signin: Schedule
  }
}

export interface Schedule {
  id: number
  time: Date
  interval: number
}

export function apply(ctx: Context) {
  // 这里是新增表的接口类型
  ctx.model.extend('signin', {
    // 各字段的类型声明
    id: 'unsigned',
    time: 'timestamp',
    interval: 'integer',
  })


  // 定义积分区间和对应的概率
const intervals = [
  { min: 0, max: 15, probability: 0.10 },  // 第一档
  { min: 16, max: 25, probability: 0.35 }, // 第二档
  { min: 26, max: 40, probability: 0.50 }, // 第三档
  { min: 41, max: 55, probability: 0.05 } // 第四档
];

// 计算总概率
const totalProbability = intervals.reduce((acc, curr) => acc + curr.probability, 0);

// 抽取积分区间
function drawInterval() {
  const rand = Math.random() * totalProbability;
  let cumulativeProbability = 0;
  for (const interval of intervals) {
    cumulativeProbability += interval.probability;
    if (rand < cumulativeProbability) {
      return interval;
    }
  }
}

// 在区间内随机抽取一个数
function drawPoints(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 示例使用
function lottery() {
  const selectedInterval = drawInterval();
  const { min, max } = selectedInterval;
  const points = drawPoints(min, max);
  return points;
}

// 测试
for (let i = 0; i < 10; i++) {
  console.log(`第${i+1}次抽奖结果：获得积分 ${lottery()}`);
}

ctx.command('签到', '每日签到')
            .action(async ({ session }) => {
              await ctx.database.get('bind', [session.userId], ['aid'])
              
            })

}
