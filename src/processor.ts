import { Store, TypeormDatabase } from "@subsquid/typeorm-store";
import {
  BatchContext,
  BatchProcessorItem,
  SubstrateBatchProcessor,
  toHex,
} from "@subsquid/substrate-processor";
import { lookupArchive } from "@subsquid/archive-registry";
import { Reward } from "./model";
import {
  ParachainStakingRewardedEvent,
} from "./types/events";

const processor = new SubstrateBatchProcessor()
  .setBatchSize(500)
  .setDataSource({
    archive: lookupArchive("moonriver", { release: "FireSquid" }),
  })
  .addEvent("ParachainStaking.Rewarded")

processor.setBlockRange({ from: 450302 });

processor.run(new TypeormDatabase(), async (ctx) => {
  const rewards = await getRewards(ctx);
  await ctx.store.insert(rewards);
});

type Item = BatchProcessorItem<typeof processor>;
type Ctx = BatchContext<Store, Item>;

async function getRewards(ctx: Ctx): Promise<Reward[]> {
  const rewards: Reward[] = []
  for (const block of ctx.blocks) {
    for (const item of block.items) {
      if (item.name === "ParachainStaking.Rewarded") {

        const event = new ParachainStakingRewardedEvent(ctx, item.event);
        let balance;
        let account: string;

        if (event.isV49){
          account = toHex(event.asV49[0]);
          balance = event.asV49[1];
        } else {
          account = toHex(event.asV1300.account);
          balance = event.asV1300.rewards;
        }

        const [blockNo, eventIdx] = item.event.id.split('-');
        const reward = new Reward();

        let index = parseInt(eventIdx, 10).toString();
        if (index.length == 1) {
          index = `00${index}`;
        } else if (index.length == 2) {
          index = `0${index}`;
        }
        
        reward.id = `${parseInt(blockNo, 10)}-${index}`;
        reward.account = account;
        reward.balance = balance;
        reward.timestamp = BigInt(block.header.timestamp);

        rewards.push(reward);
      }     
    }
  }
  return rewards;
}
