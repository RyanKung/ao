import { fromPromise, of, Rejected, Resolved } from 'hyper-async'
import { always, applySpec, prop } from 'ramda'
import { z } from 'zod'

import { messageTraceSchema } from '../model.js'

/**
 * Business logic api for the underlying datastore that is utilized
 * by this MU
 *
 * Given a DB instace, this business logic will map the domain models
 * to/from the persistence api, as implemented by the dbInstance
 *
 * TODO: de-conflate these models with persistence models, and move to models.js
 */

const cachedMsgSchema = z.object({
  /**
   * The pseudo-random unique identifier
   */
  _id: z.string().min(1),
  /**
   * The id of the data item transaction that represents this message
   * on chain
   */
  fromTxId: z.string().min(1),
  /**
   * The JSON representation of the message data item, prior to signing
   */
  msg: z.any(),
  /**
   * When this message was cached in the MU
   */
  cachedAt: z.preprocess(
    (arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : arg),
    z.date()
  ),
  /**
   * The target process of the message -- which process produced this message in its outbox
   */
  processId: z.string().min(1),
  /**
   * The initial txid that this message was cranked for, or if it is the initial message,
   * this will match _id.
   */
  initialTxId: z.string().nullable()
})

function saveMsgWith ({ dbInstance, logger: _logger }) {
  const logger = _logger.child('saveMsg')
  return (msg) => {
    return of(msg)
      .map(applySpec({
        _id: prop('id'),
        fromTxId: prop('fromTxId'),
        msg: prop('msg'),
        cachedAt: prop('cachedAt'),
        processId: prop('processId'),
        initialTxId: prop('initialTxId')
      }))
      .map(cachedMsgSchema.parse)
      .chain((doc) =>
        of(doc)
          .chain(fromPromise((doc) => dbInstance.putMsg(doc)))
          .bimap(
            logger.tap('Encountered an error when caching msg'),
            logger.tap('Cached msg')
          )
          .bichain(Resolved, Resolved)
          .map(always(doc._id))
      )
      .toPromise()
  }
}

function findLatestMsgsWith ({ dbInstance }) {
  return ({ fromTxId }) => {
    return of({ fromTxId })
      .chain(fromPromise(() => {
        return dbInstance.findMsgs(fromTxId).then((res) => {
          return res
        })
      }))
      .chain((docs) => {
        if (docs.length === 0) {
          return Rejected('No documents found')
        }

        const parsedDocs = docs.map(doc => cachedMsgSchema.parse(doc))

        return Resolved(parsedDocs.map(doc => ({
          id: prop('_id', doc),
          fromTxId: prop('fromTxId', doc),
          toTxId: prop('toTxId', doc),
          msg: prop('msg', doc),
          cachedAt: prop('cachedAt', doc),
          processId: prop('processId', doc),
          initialTxId: prop('initialTxId', doc)
        })))
      })
      .toPromise()
  }
}

function deleteMsgWith ({ dbInstance, logger: _logger }) {
  const logger = _logger.child('deleteMsg')

  return (_id) => {
    return of({ _id })
      .chain(fromPromise(() => dbInstance.deleteMsg(_id)))
      .bimap(
        logger.tap('Encountered an error when deleting msg'),
        logger.tap('Deleted msg')
      )
      .bichain(Resolved, Resolved)
      .map(always(_id))
      .toPromise()
  }
}

const cachedSpawnSchema = z.object({
  /**
   * The pseudo-random unique identifier
   */
  _id: z.string().min(1),
  /**
   * The id of the data item transaction that represents this message
   * on chain
   */
  fromTxId: z.string().min(1),
  /**
   * The JSON representation of the message data item, prior to signing
   */
  spawn: z.any(),
  /**
   * When this message was cached in the MU
   */
  cachedAt: z.preprocess(
    (arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : arg),
    z.date()
  ),
  /**
   * The process that produced this spawn
   */
  processId: z.string().min(1),
  /**
   * The initial txid that this spawn was cranked for, or if it is the initial spawn,
   * this will match _id.
   */
  initialTxId: z.string().nullable()
})

function saveSpawnWith ({ dbInstance, logger: _logger }) {
  const logger = _logger.child('spawn')
  return (spawn) => {
    return of(spawn)
      .map(applySpec({
        _id: prop('id'),
        fromTxId: prop('fromTxId'),
        spawn: prop('spawn'),
        cachedAt: prop('cachedAt'),
        processId: prop('processId'),
        initialTxId: prop('initialTxId')
      }))
      .map(cachedSpawnSchema.parse)
      .chain((doc) =>
        of(doc)
          .chain(fromPromise((doc) => dbInstance.putSpawn(doc)))
          .bimap(
            logger.tap('Encountered an error when caching spawn'),
            logger.tap('Cached spawn')
          )
          .bichain(Resolved, Resolved)
          .map(always(doc._id))
      )
      .toPromise()
  }
}

function findLatestSpawnsWith ({ dbInstance }) {
  return ({ fromTxId }) => {
    return of({ fromTxId })
      .chain(fromPromise(() => {
        return dbInstance.findSpawns(fromTxId).then((res) => {
          if (res.warning) console.warn(res.warning)
          return res
        })
      }))
      .chain((docs) => {
        if (docs.length === 0) {
          return Rejected('No documents found')
        }

        const parsedDocs = docs.map(doc => cachedSpawnSchema.parse(doc))

        return Resolved(parsedDocs.map(doc => ({
          id: prop('_id', doc),
          fromTxId: prop('fromTxId', doc),
          toTxId: prop('toTxId', doc),
          spawn: prop('spawn', doc),
          cachedAt: prop('cachedAt', doc),
          processId: prop('processId', doc),
          initialTxId: prop('initialTxId', doc)
        })))
      })
      .toPromise()
  }
}

function deleteSpawnWith ({ dbInstance, logger: _logger }) {
  const logger = _logger.child('deleteSpawn')

  return (_id) => {
    return of(_id)
      .chain(fromPromise(() => dbInstance.deleteSpawn(_id)))
      .bimap(
        logger.tap('Encountered an error when deleting spawn'),
        logger.tap('Deleted spawn')
      )
      .bichain(Resolved, Resolved)
      .map(always(_id))
      .toPromise()
  }
}

const monitoredProcessSchema = z.object({
  _id: z.string().min(1),
  // is this monitored process authorized to run by the server (is it funded)
  authorized: z.boolean(),
  lastFromCursor: z.string().nullable(),
  processData: z.any(),
  _rev: z.string().optional(),
  createdAt: z.number(),
  lastRunTime: z.number().nullable()
})

function saveMonitoredProcessWith ({ dbInstance, logger: _logger }) {
  const logger = _logger.child('saveMonitoredProcess')
  return (process) => {
    return of(process)
      .map(applySpec({
        _id: prop('id'),
        authorized: prop('authorized'),
        lastFromCursor: prop('lastFromCursor'),
        processData: prop('processData'),
        createdAt: prop('createdAt'),
        lastRunTime: prop('lastRunTime')
      }))
      .map(monitoredProcessSchema.parse)
      .chain((doc) =>
        of(doc)
          .chain(fromPromise((doc) => dbInstance.putMonitor(doc)))
          .bimap(
            logger.tap('Encountered an error when caching monitored process'),
            logger.tap('Cached monitor')
          )
          .bichain(Resolved, Resolved)
          .map(always(doc._id))
      )
      .toPromise()
  }
}

function findLatestMonitorsWith ({ dbInstance }) {
  return () => {
    return of({})
      .chain(fromPromise(() => {
        return dbInstance.findMonitors().then((res) => {
          if (res.warning) console.warn(res.warning)
          return res
        })
      }))
      .chain((docs) => {
        if (docs.length === 0) {
          return Resolved([])
        }

        const parsedDocs = docs.map(doc => monitoredProcessSchema.parse(doc))

        return Resolved(parsedDocs.map(doc => ({
          id: prop('_id', doc),
          authorized: prop('authorized', doc),
          lastFromCursor: prop('lastFromCursor', doc),
          processData: prop('processData', doc),
          createdAt: prop('createdAt', doc),
          lastRunTime: prop('lastRunTime', doc)
        })))
      })
      .toPromise()
  }
}

function updateMonitorWith ({ dbInstance, logger: _logger }) {
  const logger = _logger.child('updateMonitor')

  return ({ id, lastFromCursor, lastRunTime }) => {
    return of({ id })
      .chain(fromPromise(() => dbInstance.getMonitor(id)))
      // createdAt comes out of the db as a string so we put it back to int
      .map(doc => ({ ...doc, lastFromCursor, createdAt: parseInt(doc.createdAt), lastRunTime }))
      .map(monitoredProcessSchema.parse)
      .chain(updatedDoc =>
        of(updatedDoc)
          .chain(fromPromise(() => dbInstance.putMonitor(updatedDoc)))
          .bimap(
            logger.tap('Encountered an error when updating monitor'),
            logger.tap('Updated monitor')
          )
          .bichain(Resolved, Resolved)
          .map(always(updatedDoc._id))
      )
      .toPromise()
  }
}

function deleteMonitorWith ({ dbInstance, logger: _logger }) {
  const logger = _logger.child('deleteMonitor')

  return ({ id }) => {
    return of({ id })
      .chain(fromPromise(() => dbInstance.deleteMonitor(id)))
      .map(doc => ({ ...doc }))
      .chain(deletedDoc =>
        of(deletedDoc)
          .map(always(deletedDoc._id))
          .map(logger.tap('Deleted monitor'))
      )
      .toPromise()
  }
}

function saveMessageTraceWith ({ dbInstance, logger: _logger }) {
  const logger = _logger.child('saveMessageTrace')

  return (messageTrace) => {
    return of(messageTrace)
      .map(messageTraceSchema.parse)
      .map(applySpec({
        _id: prop('id'),
        parent: prop('parent'),
        children: prop('children'),
        spawns: prop('spawns'),
        from: prop('from'),
        to: prop('to'),
        message: prop('message'),
        trace: prop('trace'),
        tracedAt: prop('tracedAt')
      }))
      .chain((doc) =>
        of(doc)
          .chain(fromPromise((doc) => dbInstance.putMessageTrace(doc)))
          .bimap(
            logger.tap(`Encountered an error when saving message trace for message ${messageTrace.id}`),
            logger.tap('Saved message trace')
          )
          .bichain(Resolved, Resolved)
          .map(always(doc._id))
      )
      .toPromise()
  }
}

function findMessageTracesWith ({ dbInstance, logger: _logger }) {
  const criteria = z.object({
    id: z.string().optional(),
    process: z.string().optional(),
    wallet: z.string().optional(),
    /**
     * Always require a limit, so the database does not get bogged down
     * with sending too large of a response
     */
    limit: z.number().int().positive(),
    offset: z.number().int().optional()
  })

  return ({ id, process, wallet, limit, offset }) => {
    return of({ id, process, wallet, limit, offset })
      .map(params => criteria.parse(params))
      .chain(fromPromise((params) => dbInstance.findMessageTraces(params)))
      .chain((docs) => {
        return Resolved(
          docs.map((doc) => ({
            id: prop('_id', doc),
            parent: prop('parent', doc),
            children: prop('children', doc),
            spawns: prop('spawns', doc),
            from: prop('from', doc),
            to: prop('to', doc),
            message: prop('message', doc),
            trace: prop('trace', doc),
            tracedAt: prop('tracedAt', doc)
          }))
        )
      })
      .toPromise()
  }
}

export default {
  cachedMsgSchema,
  saveMsgWith,
  saveSpawnWith,
  updateMonitorWith,
  deleteMonitorWith,
  findLatestMsgsWith,
  findLatestSpawnsWith,
  findLatestMonitorsWith,
  saveMonitoredProcessWith,
  deleteMsgWith,
  deleteSpawnWith,
  messageTraceSchema,
  saveMessageTraceWith,
  findMessageTracesWith
}
