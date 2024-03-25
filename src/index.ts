import { Context, Schema } from 'koishi'

export const name = 'signin'

export interface Config { }

export const Config: Schema<Config> = Schema.object({


})


declare module 'koishi' {
  interface Binding {
    pid: string
    aid: number
  }
}


declare module 'koishi' {
  interface Tables {
    signin: Schedule
  }
}

export interface Schedule {
  id: number
  lastSignInDate: Date
  consecutiveDays: number
}

export function apply(ctx: Context) {
  // 这里是新增表的接口类型
  ctx.model.extend('signin', {
    // 各字段的类型声明
    id: 'unsigned',
    lastSignInDate: 'timestamp',
    consecutiveDays: 'integer',
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
    console.log(`第${i + 1}次抽奖结果：获得积分 ${lottery()}`);
  }

  ctx.command('签到', '每日签到')
    .action(async ({ session }) => {
      const userId = await ctx.database.get('binding', { pid: [session.userId] }, ['aid'])[0]?.aid
      // console.log(userId)
      const userInfo = await ctx.database.get('signin', { id: userId })
      console.log(userInfo)
      // 添加用户数据
      if (userInfo) {

        
        // 假设有一个能够读取和更新数据库的方法
        const database = {
          lastSignInDate: "2024-03-24", // 假设数据库中记录的上次签到日期是 2024-03-24
          consecutiveDays: 5 // 假设数据库中记录的连续签到天数是 5
        };

        // 计算连续签到加成
        function calculateBonus(consecutiveDays) {
          if (consecutiveDays > 0) {
            return Math.min(0.1 + (consecutiveDays - 1) * 0.05, 0.35); // 最高加成35%
          }
          return 0;
        }

        // 更新数据库中的签到信息
        function updateDatabase(lastSignInDate, consecutiveDays) {
          // 假设有一个更新数据库的方法
          // updateDatabaseMethod(lastSignInDate, consecutiveDays);
          // 更新数据库的伪代码如下：
          database.lastSignInDate = lastSignInDate;
          database.consecutiveDays = consecutiveDays;
        }

        // 模拟读取数据库中的签到信息
        const lastSignInDate= userInfo[0];
        const consecutiveDays = userInfo[1];

        // 假设当前日期是 2024-03-25
        const currentDate = "2024-03-25";

        // 计算连续签到天数是否连续
        let newConsecutiveDays = consecutiveDays;
        if (currentDate === lastSignInDate) {
          newConsecutiveDays++; // 连续签到天数加一
        } else {
          newConsecutiveDays = 1; // 重新开始连续签到计数
        }

        // 计算连续签到加成
        const bonus = calculateBonus(newConsecutiveDays);

        // 计算获得的积分
        const basePoints = lottery(); // 假设调用了前面的抽奖函数
        const extraPoints = Math.floor(basePoints * bonus);

        // 更新数据库中的签到信息
        updateDatabase(currentDate, newConsecutiveDays);

        // 输出结果
        console.log(`连续签到天数：${newConsecutiveDays}`);
        console.log(`连续签到加成：${bonus * 100}%`);
        console.log(`基础积分：${basePoints}`);
        console.log(`额外积分：${extraPoints}`);


      }
    })



}
