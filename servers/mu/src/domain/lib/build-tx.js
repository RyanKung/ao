import { Resolved, fromPromise, of } from 'hyper-async'
import z from 'zod'
import { checkStage } from '../utils.js'

const ctxSchema = z.object({
  tx: z.object({
    id: z.string(),
    data: z.any(),
    processId: z.string()
  }),
  schedLocation: z.any().nullable(),
  tagAssignments: z.any()
}).passthrough()

export function buildTxWith (env) {
  let { buildAndSign, logger, locateProcess, fetchSchedulerProcess, isWallet } = env
  locateProcess = fromPromise(locateProcess)
  fetchSchedulerProcess = fromPromise(fetchSchedulerProcess)
  buildAndSign = fromPromise(buildAndSign)
  isWallet = fromPromise(isWallet)

  return (ctx) => {
    if (!checkStage('build-tx')(ctx)) return Resolved(ctx)
    return isWallet(ctx.cachedMsg.processId)
      .chain(
        (isWalletId) => {
          return locateProcess(ctx.cachedMsg.fromProcessId)
            .chain(
              (fromSchedLocation) => fetchSchedulerProcess(
                ctx.cachedMsg.fromProcessId,
                fromSchedLocation.url
              )
                .map((schedulerResult) => ({
                  fromProcessSchedData: schedulerResult
                }))
                .chain(({ fromProcessSchedData }) => {
                  /*
                    If the target is a wallet id we will move
                    on here without setting a schedLocation
                    later in the pipeline this will mean the tx
                    goes straight to Arweave.
                  */
                  if (isWalletId) { return of({ fromProcessSchedData }) }
                  return locateProcess(ctx.cachedMsg.processId)
                    .map((schedLocation) => {
                      return {
                        schedLocation,
                        fromProcessSchedData
                      }
                    })
                })
            )
        }
      )
      .map((res) => {
        const tagsIn = [
          ...ctx.cachedMsg.msg.Tags?.filter((tag) => {
            return ![
              'Data-Protocol',
              'Type',
              'Variant',
              'From-Process',
              'From-Module',
              'Assignments'
            ].includes(tag.name)
          }) ?? [],
          { name: 'Data-Protocol', value: 'ao' },
          { name: 'Type', value: 'Message' },
          { name: 'Variant', value: 'ao.TN.1' },
          { name: 'From-Process', value: ctx.cachedMsg.fromProcessId },
          {
            name: 'From-Module',
            value: res.fromProcessSchedData.tags.find((t) => t.name === 'Module')?.value ?? ''
          }
        ]

        if (ctx.cachedMsg.initialTxId) {
          tagsIn.push({ name: 'Pushed-For', value: ctx.cachedMsg.initialTxId })
        }

        const assignmentsTag = ctx.cachedMsg.msg.Tags?.find(tag => tag.name === 'Assignments')
        const tagAssignments = assignmentsTag ? assignmentsTag.value : []

        return {
          tags: tagsIn,
          schedLocation: res.schedLocation,
          tagAssignments
        }
      })
      .chain(
        ({ tags, schedLocation, tagAssignments }) => buildAndSign({
          processId: ctx.cachedMsg.msg.Target,
          tags,
          anchor: ctx.cachedMsg.msg.Anchor,
          data: ctx.cachedMsg.msg.Data
        })
          .map((tx) => {
            return {
              tx,
              schedLocation,
              tagAssignments: tagAssignments.length > 0 ? [{ Processes: tagAssignments, Message: tx.id }] : []
            }
          })
      )
      .map((res) => {
        // add tx and schedLocation to the result
        return { ...ctx, ...res }
      })
      .map(ctxSchema.parse)
      .bimap(
        (e) => {
          return new Error(e, { cause: ctx })
        },
        (ctx) => {
          console.log(66, { messageId: ctx.tx.id })
          return logger.tap({ log: 'Added tx and schedLocation to ctx', options: { messageId: ctx.tx.id, processId: ctx.tx.processId } })(ctx)
        }
      )
  }
}
