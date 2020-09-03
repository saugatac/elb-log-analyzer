import { some, chain, isEmpty, values, pick } from 'lodash'

import { parseLine } from './parseLine'
import { filterByDate } from './filter'
import { ParserOptions, ColumnName, ColumnValue } from '../types/library'

// sort while inserting
function splice(lines: ColumnValue[][], newLine: any[], sortBy: number) {
  if (newLine.some((val) => !val)) {
    return lines
  }

  let len = lines.length
  let compare

  while (len--) {
    if (typeof lines[len][sortBy] === 'number' && typeof newLine[sortBy] === 'number') {
      compare = lines[len][sortBy] < newLine[sortBy] ? -1 : 1
    } else {
      compare = String(lines[len][sortBy]).localeCompare(newLine[sortBy].toString())
    }

    if (compare < 0) {
      break
    }
  }

  lines.splice(len + 1, 0, newLine)
  return lines
}

interface ProcessorType {
  process(filterFunc: Function | null, line: string): void
  getResults(): ColumnValue[][]
}

export function generateProcessor({
  requestedColumns,
  sortBy,
  ascending,
  limit,
  prefixes,
  start,
  end,
}: ParserOptions): ProcessorType {
  const indexOfCountColumn = requestedColumns.indexOf('count')

  if (indexOfCountColumn > -1) {
    const counts: { [key: string]: number } = {}
    const times: { [key: string]: number } = {}
    const max: { [key: string]: number } = {}
    const tempCols = requestedColumns.slice(0)

    tempCols.splice(indexOfCountColumn, 1)

    return {
      process(filterFunc, line) {
        if (isEmpty(line)) {
          return
        }

        const parsedLineAsObject = parseLine(line)

        // console.log('parsedLineAsObject', line)
        if (!parsedLineAsObject) {
          return
        }

        // filter lines by date if requested
        if ((start || end) && filterByDate(parsedLineAsObject, start, end)) {
          return
        }

        const parsedLineWithRequestedColumns = values(pick(parsedLineAsObject, tempCols))

        // Drop the line if any of the columns requested does not exist in this line
        if (
          some(parsedLineWithRequestedColumns, (column: ColumnName) => !column && column !== 'null')
        ) {
          return
        }

        // Count column is not in 'line' at this moment
        // so we are defining a new variable that includes it
        if (filterFunc && !filterFunc(parsedLineWithRequestedColumns)) {
          return
        }

        // stringifying columns serves as a multi-column group_by
        // const LINESTRING = JSON.stringify(parsedLineWithRequestedColumns)
        // console.log(parsedLineWithRequestedColumns);
        // console.log(parsedLineWithRequestedColumns[0]);
        // console.log(parsedLineWithRequestedColumns[1]);
        // console.log(parsedLineWithRequestedColumns[2]);
        // console.log(parsedLineWithRequestedColumns[3]);
        const indx1 = "[\""+parsedLineWithRequestedColumns[1]+"\",\""+parsedLineWithRequestedColumns[2]+"\",\""+parsedLineWithRequestedColumns[3]+"\"]";
        counts[indx1] = counts[indx1] ? counts[indx1] + 1 : 1
        const indx2 = ""+parsedLineWithRequestedColumns[1]+parsedLineWithRequestedColumns[2]+parsedLineWithRequestedColumns[3];
        // console.log(indx2);
        const tim = parsedLineWithRequestedColumns[0] as number;
        times[indx2]=times[indx2]?
        times[indx2]+1*(tim):(tim);
        max[indx2]=max[indx2]?Math.max(max[indx2],tim):tim;

          // console.log(times[indx2]);
      },

      getResults() {
        let q = chain(counts).map(function (countNumber, key) {
          const line = JSON.parse(key)
          const timekey=line[0]+line[1]+line[2];
          // console.log(timekey);
          // console.log(timekey);
          // console.log(indexOfCountColumn);
          // console.log(countNumber);
          line.splice(indexOfCountColumn, 0, countNumber)
          line.splice(1, 0, times[timekey])
          line.splice(2, 0, times[timekey]/countNumber)
          line.splice(3, 0, max[timekey])
          return line
        })

        if (prefixes && prefixes[indexOfCountColumn]) {
          q = q.filter((line: string) =>
            line[indexOfCountColumn].toString().startsWith(prefixes[indexOfCountColumn])
          )
        }

        return q.sortBy(sortBy.toString()).value()
      },
    }
  } else {
    let outputLines: ColumnValue[][] = []

    return {
      process(filterFunc, line) {
        const lineObj = parseLine(line)

        if (!lineObj) {
          return
        }

        // filter lines by date if requested
        if ((start || end) && filterByDate(lineObj, start, end)) {
          return
        }

        const mappedLine: any = values(pick(lineObj, ...requestedColumns))

        // Drop the line if any of the columns requested does not exist in this line
        if (some(mappedLine, (columnValue: ColumnValue) => typeof columnValue === 'undefined')) {
          return
        }

        if (filterFunc && !filterFunc(lineObj)) {
          return
        }

        // Add lines until the limit is reached
        if (outputLines.length < limit) {
          outputLines = splice(outputLines, mappedLine, sortBy)
          return
        }

        // Drop lines immediately that are below the last item
        // of currently sorted list. Otherwise add them and
        // drop the last item.
        let compare: ColumnValue | undefined
        const firstLine = outputLines[0]

        if (firstLine) {
          if (typeof firstLine[sortBy] === 'number' && typeof mappedLine[sortBy] === 'number') {
            compare = firstLine[sortBy] < mappedLine[sortBy] ? -1 : 1
          } else {
            compare = String(firstLine[sortBy]).localeCompare(mappedLine[sortBy].toString())
          }
        }

        if ((!ascending && compare === 1) || (ascending && compare === -1)) {
          return
        }

        outputLines = splice(outputLines, mappedLine, sortBy)
        outputLines.shift()
      },

      getResults() {
        return outputLines
      },
    }
  }
}
