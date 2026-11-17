/**
 * xlsx.worker.js — runs the xlsx parsers off the main thread so a big workbook doesn't
 * freeze the tab. Message in: { id, fn, args }; out: { id, result } or { id, error }.
 */
import * as xlsx from './xlsx'

self.onmessage = ({ data: { id, fn, args } }) => {
  try {
    self.postMessage({ id, result: xlsx[fn](...args) })
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) })
  }
}
