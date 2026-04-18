import { MutationCtx } from "../_generated/server";
import { Doc, TableNames } from "../_generated/dataModel";

export async function getNextOrderIndex(
  ctx: MutationCtx,
  table: TableNames,
  indexName: string,
  indexValue: unknown[]
): Promise<number> {
  const items = await (ctx.db.query(table) as any)
    .withIndex(indexName, (q: any) => {
      let chain = q;
      for (const val of indexValue) {
        chain = chain.eq(chain, val);
      }
      return chain;
    })
    .collect();

  if (items.length === 0) return 0;
  return Math.max(...items.map((i: any) => i.orderIndex ?? 0)) + 1;
}

export async function reorderItems<T extends { _id: any; orderIndex: number }>(
  ctx: MutationCtx,
  table: TableNames,
  items: T[],
  movedId: string,
  newIndex: number
): Promise<void> {
  const sorted = [...items].sort((a, b) => a.orderIndex - b.orderIndex);
  const movedItem = sorted.find((i) => i._id === movedId);
  if (!movedItem) return;

  const without = sorted.filter((i) => i._id !== movedId);
  without.splice(newIndex, 0, movedItem);

  for (let i = 0; i < without.length; i++) {
    if (without[i].orderIndex !== i) {
      await ctx.db.patch(without[i]._id, { orderIndex: i } as any);
    }
  }
}
