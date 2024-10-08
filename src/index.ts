import { Context, Schema, Logger, h, Random, Time } from 'koishi'
import { } from 'koishi-plugin-monetary'

export const name = 'signin'
export const inject = ['monetary', 'database']
const log = new Logger('signin');

export const usage = `

  - 签到提示信息分：凌晨，早上，中午，下午，晚上时间段。
  
    - [0--7)，[7--11)，[11--13)，[13--20)，[20--24)
`

export interface Config {
  积分区间: number[][],
  提示语: string[],
  连续奖励: number[],
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
~~~`),
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
`),
  连续奖励: Schema.tuple([Number, Number, Number]).description(`连续签到额外奖励。最小值、最大值以及步长（增量）。`)
})

declare module 'koishi' {
  interface Tables {
    signin_kx: Table
  }
}

export interface Table {
  id: number,
  lastSignInDate: string,
  consecutiveDays: number
}

export function apply(ctx: Context, config: Config) {
  let newUser = false;

  // 这里是新增表的接口类型
  ctx.model.extend('signin_kx', {
    // 各字段的类型声明
    id: 'integer',
    lastSignInDate: 'string',
    consecutiveDays: 'integer'
  })

  // 定义积分区间和对应的概率
  const intervals = config.积分区间.map(([min, max, probability]) => ({ min, max, probability: probability / 100 }));

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
    const weights = intervals.reduce((acc, curr) => {
      acc[curr.min] = curr.probability;
      return acc;
    }, {} as Record<number, number>);
    const min = Number(Random.weightedPick(weights));
    return intervals.find(interval => interval.min === min);
  }

  // 抽奖函数
  function lottery() {
    const selectedInterval = drawInterval();
    if (!selectedInterval) {
      throw new Error('No interval selected');
    }
    const { min, max } = selectedInterval;
    const points = Random.int(min, max + 1);
    return points;
  }

  function formattedDate() {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const date = `${year}-${month}-${day}`; // 确保格式为 YYYY-MM-DD
    const hour = currentDate.getHours();
    return { date, hour }; // 输出格式为 YYYY-MM-DD 的当前日期
  }

  ctx.command('签到', '每日签到')
    .action(async ({ session }) => {
      newUser = false;
      const userAid = (await ctx.database.get('binding', { pid: [session.userId] }, ['aid']))[0]?.aid;
      log.debug(userAid);

      let userInfo = await ctx.database.get('signin_kx', { id: userAid });
      log.debug(userInfo);

      // 假设当前日期是 2024-03-25
      const currentDate = formattedDate();

      // 添加用户数据
      if (userInfo.length === 0) {
        await ctx.database.create('signin_kx', { id: Number(userAid), lastSignInDate: currentDate.date, consecutiveDays: 0 });
        userInfo = [{ id: userAid, lastSignInDate: currentDate.date, consecutiveDays: 0 }];
        newUser = true;
      }

      // 读取数据库中的签到信息
      const lastSignInDate = userInfo[0]?.lastSignInDate;
      const consecutiveDays = userInfo[0]?.consecutiveDays;

      // 计算连续签到天数
      let newConsecutiveDays = consecutiveDays;
      if (currentDate.date === lastSignInDate && !newUser) {
        session.send(h('at', { id: session.userId }) + config.提示语[5])
      } else if (Time.getDateNumber(Time.parseDate(currentDate.date)) === Time.getDateNumber(Time.parseDate(lastSignInDate)) + 1) {
        newConsecutiveDays++; // 连续签到天数加一
        signinGreet();
      } else {
        newConsecutiveDays = 0; // 重新开始连续签到计数
        signinGreet();
      }

      async function signinGreet() {
        const currentHour = currentDate.hour;
        const resultPoints = await getPoints();

        const basePoints = resultPoints.basePoints;
        const extraPoints = resultPoints.extraPoints;
        const bonus = resultPoints.bonus;
        const consecutiveDays = resultPoints.newConsecutiveDays;
        const endStatement = `\n\n获得: ${basePoints + extraPoints} 积分，基础: ${basePoints}，额外: ${extraPoints}。\n连续签到 ${consecutiveDays} 天，获得 ${bonus}% 加成。`;

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

      async function getPoints() { // 计算连续签到加成
        newUser = false; // 重置新用户标记

        let bonus = 0; // 初始加成为0%

        // 计算连续签到加成
        if (newConsecutiveDays > 0) {
          bonus = Math.floor(Math.min(config.连续奖励[0] + (newConsecutiveDays - 1) * config.连续奖励[2], config.连续奖励[1])); // 初始5%+....<=35%
        }

        // 计算获得的积分
        const basePoints = lottery(); // 调用了前面的抽奖函数
        const extraPoints = Math.floor(basePoints * bonus / 100);

        // 更新数据库中的签到信息
        ctx.database.set('signin_kx', { id: userAid }, { lastSignInDate: currentDate.date, consecutiveDays: newConsecutiveDays });

        const money = basePoints + extraPoints; // 更新用户余额

        ctx.monetary.gain(userAid, money);

        log.debug(money);

        // 输出结果
        log.debug(`连续签到天数：${newConsecutiveDays}`);
        log.debug(`连续签到加成：${bonus}%`);
        log.debug(`基础积分：${basePoints}`);
        log.debug(`额外积分：${extraPoints}`);
        return { basePoints, extraPoints, newConsecutiveDays, bonus }; // 返回获得的积分
      }
    })
}