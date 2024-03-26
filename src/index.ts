import { Context, Schema, Logger, h } from 'koishi'
import { } from 'koishi-plugin-monetary'

export const name = 'signin'
export const inject = ['monetary']
const logger = new Logger('signin');

export const usage = `
  只测试了QQ频道。

  - 签到提示信息分：凌晨，早上，中午，下午，晚上时间段。
  
    - [0--7)，[7--11)，[11--13)，[13--20)，[20--24)
`

export interface Config {
  积分区间: any,
  提示语: any,
  连续奖励: any,
}

export const Config: Schema<Config> = Schema.object({
  积分区间: Schema.array(
    Schema.tuple([Number, Number, Number])
  ).description(`最小值、最大值以及概率。
- 模板：
~~~
0，15，5
16，25，35
......
~~~`).required(),
  提示语: Schema.array(String).role('table').description(`凌晨、早上、中午、下午、晚上、重复签到提示，必须按顺序，且=6。
- 模板：
~~~
签到✓，该睡觉啦！ (つω｀)
早上好！签到✓    (o-ωｑ)
中午好！签到✓   (/▽＼)
下午好~  签到✓    ╰(*°▽°*)╯
晚上好~  签到✓    (◡ᴗ◡✿)
今天已经签过到啦，明天再来吧~  (๑¯∀¯๑)。
~~~
`).required(),
  连续奖励: Schema.tuple([Number, Number, Number]).default([5,35,5]).description(`连续签到额外奖励。最小值、最大值以及步长（增量）。`)
})

declare module 'koishi' {
  interface Binding {
    pid: string,
    aid: number
  }
}

declare module 'koishi' {
  interface Tables {
    signin: Schedule
  }
}

export interface Schedule {
  id: number,
  lastSignInDate: string,
  consecutiveDays: number
}

export function apply(ctx: Context, config: Config) {

  // 这里是新增表的接口类型
  ctx.model.extend('signin', {
    // 各字段的类型声明
    id: 'integer',
    lastSignInDate: 'string',
    consecutiveDays: 'integer'
  })


  // 定义积分区间和对应的概率
  const intervals = [
    { min: config.积分区间[0][0], max: config.积分区间[0][1], probability: config.积分区间[0][2] / 100 },  // 第一档
    { min: config.积分区间[1][0], max: config.积分区间[1][1], probability: config.积分区间[1][2] / 100 }, // 第二档
    { min: config.积分区间[2][0], max: config.积分区间[2][1], probability: config.积分区间[2][2] / 100 }, // 第三档
    { min: config.积分区间[3][0], max: config.积分区间[3][1], probability: config.积分区间[3][2] / 100 } // 第四档
  ];

  // 计算总概率
  let totalProbability = intervals.reduce((acc, curr) => acc + curr.probability, 0);
  // 如果概率总和不为1，则按比例缩放每个概率值
  if (totalProbability !== 1) {
    // 缩放比例
    const scale = 1 / totalProbability;
    // 缩放每个概率值
    intervals.forEach(interval => {
      interval.probability *= scale;
    });
    // 重新计算总概率
    totalProbability = 1;
  }

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

  // 抽奖函数
  function lottery() {
    const selectedInterval = drawInterval();
    const { min, max } = selectedInterval;
    const points = Math.floor(Math.random() * (max - min + 1)) + min;
    return points;
  }

  // 测试
  // for (let i = 0; i < 10; i++) {
  //   logger.info(`第${i + 1}次抽奖结果：获得积分 ${lottery()}`);
  // }

  function formattedDate() {
    const currentDate = new Date();

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1; // 月份从 0 开始，所以需要加 1
    const day = currentDate.getDate();
    const hour = currentDate.getHours();

    const date = `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;
    return { date, day, hour }; // 输出格式为 YYYY-MM-DD 的当前日期
  }

  ctx.command('签到', '每日签到')
    .action(async ({ session }) => {
      let newUser = false;
      const userId = await ctx.database.get('binding', { pid: [session.userId] }, ['aid']);
      const userAid = userId[0]?.aid;
      logger.debug(userAid);

      let userInfo = await ctx.database.get('signin', { id: userAid });
      logger.debug(userInfo);


      // 假设当前日期是 2024-03-25
      const currentDate = formattedDate();

      // 添加用户数据
      if (userInfo.length === 0) {
        await ctx.database.create('signin', { id: Number(userAid), lastSignInDate: currentDate.date });
        userInfo = [{ id: userAid, lastSignInDate: currentDate.date, consecutiveDays: 0 }];
        newUser = true;
      }

      // 读取数据库中的签到信息
      const lastSignInDate = userInfo[0]?.lastSignInDate;
      const consecutiveDays = userInfo[0]?.consecutiveDays;
      const lastDay = lastSignInDate.split("-")[2];

      async function signinGreet() {
        const currentHour = currentDate.hour;
        const resultPoints = await getPoints();

        const basePoints = resultPoints.basePoints;
        const extraPoints = resultPoints.extraPoints;
        const bonus = resultPoints.bonus;
        const consecutiveDays = resultPoints.newConsecutiveDays;
        const endStatement = `\n\n获得: ${basePoints + extraPoints} 积分，基础: ${basePoints}，额外: ${extraPoints}。\n连续签到 ${consecutiveDays} 天，获得 ${bonus * 100}% 加成。`;

        if (currentHour >= 0 && currentHour < 7) {
          session.send(h('at', { id: session.userId }) + config.提示语[0] + endStatement);
        } else if (currentHour >= 7 && currentHour < 11) {
          session.send(h('at', { id: session.userId }) + config.提示语[1] + endStatement);
        } else if (currentHour >= 11 && currentHour < 13) {
          session.send(h('at', { id: session.userId }) + config.提示语[2] + endStatement);
        } else if (currentHour >= 13 && currentHour < 20) {
          session.send(h('at', { id: session.userId }) + config.提示语[3] + endStatement);
        } else if (currentHour >= 20 && currentHour < 24) {
          session.send(h('at', { id: session.userId }) + config.提示语[4] + endStatement);
        }
      }


      // 计算连续签到天数
      let newConsecutiveDays = consecutiveDays;
      if (currentDate.date === lastSignInDate && !newUser) {
        session.send(h('at', { id: session.userId }) + config.提示语[5])
      } else if (currentDate.day == Number(lastDay) + 1) {
        newConsecutiveDays++; // 连续签到天数加一
        signinGreet();
      } else {
        newConsecutiveDays = 0; // 重新开始连续签到计数
        signinGreet();
      }


      async function getPoints() {// 计算连续签到加成
        newUser = false; // 重置新用户标记

        let bonus = 0; // 初始加成为0%

        // 计算连续签到加成
        if (newConsecutiveDays > 0) {
          bonus = Math.floor(Math.min(0.05 + (newConsecutiveDays - 1) * 0.05, 0.35)); // 初始5%+....<=35%
        }

        // 计算获得的积分
        const basePoints = lottery(); // 调用了前面的抽奖函数
        const extraPoints = Math.floor(basePoints * bonus);

        // 更新数据库中的签到信息
        ctx.database.set('signin', { id: userAid }, { lastSignInDate: currentDate.date, consecutiveDays: newConsecutiveDays });

        const money = basePoints + extraPoints; // 更新用户余额

        ctx.monetary.gain(userAid, money);

        logger.debug(money);


        // 输出结果
        logger.debug(`连续签到天数：${newConsecutiveDays}`);
        logger.debug(`连续签到加成：${bonus * 100}%`);
        logger.debug(`基础积分：${basePoints}`);
        logger.debug(`额外积分：${extraPoints}`);
        return { basePoints, extraPoints, newConsecutiveDays, bonus }; // 返回获得的积分
      }
    })
}
