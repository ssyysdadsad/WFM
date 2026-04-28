import * as XLSX from 'xlsx';

export interface ParsedDailyRecord {
  date: number; // 1-31
  firstPunchTime: string | null; // e.g. "08:38"
  lastPunchTime: string | null;  // e.g. "18:00"
  rawText: string;
}

export interface ParsedEmployeeRecord {
  employeeName: string;
  dailyRecords: Record<number, ParsedDailyRecord>;
}

export async function parseAttendanceExcel(file: File): Promise<ParsedEmployeeRecord[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Assume the first sheet contains the data
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Read as array of arrays (matrix)
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        // 1. Locate the header row containing dates ("1\n星期日", "2\n星期一", etc.)
        let dateHeaderRowIndex = -1;
        let dateColumnMap: Record<number, number> = {}; // { date: columnIndex }
        let nameColumnIndex = -1;

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          let foundDates = 0;
          for (let c = 0; c < row.length; c++) {
            const cellValue = String(row[c] || '').trim();
            
            if (cellValue === '姓名') {
              nameColumnIndex = c;
            }

            // Match "1\n星期日", "1\r\n星期日", "1星期日", "1"
            const dateMatch = cellValue.match(/^(\d{1,2})\s*[\r\n]*\s*星期/);
            if (dateMatch) {
              const dateNum = parseInt(dateMatch[1], 10);
              dateColumnMap[dateNum] = c;
              foundDates++;
            }
          }

          if (foundDates >= 28) {
            // Found the row with month dates
            dateHeaderRowIndex = r;
            
            // If nameColumnIndex is still -1, check the row above
            if (nameColumnIndex === -1 && r > 0) {
              for (let c = 0; c < rows[r - 1].length; c++) {
                if (String(rows[r - 1][c] || '').trim() === '姓名') {
                  nameColumnIndex = c;
                  break;
                }
              }
            }
            
            // Default to 0 if still not found
            if (nameColumnIndex === -1) {
              nameColumnIndex = 0;
            }
            
            break;
          }
        }

        if (dateHeaderRowIndex === -1) {
          throw new Error('无法识别考勤表头结构，未找到 1~31 号的日期列。请确保上传的是“上下班打卡_打卡时间记录.xlsx”格式的报表。');
        }

        const parsedRecords: ParsedEmployeeRecord[] = [];

        // 2. Parse employee rows (data starts after the header row)
        for (let r = dateHeaderRowIndex + 1; r < rows.length; r++) {
          const row = rows[r];
          const employeeName = String(row[nameColumnIndex] || '').trim();
          
          if (!employeeName || employeeName === '姓名' || employeeName === 'NaN') {
            continue; // Skip empty rows or repeated headers
          }

          const dailyRecords: Record<number, ParsedDailyRecord> = {};

          for (const dateStr in dateColumnMap) {
            const dateNum = parseInt(dateStr, 10);
            const colIdx = dateColumnMap[dateNum];
            let rawText = String(row[colIdx] || '').trim();
            
            // Skip placeholders like "--"
            if (rawText === '--' || rawText === '—') {
              rawText = '';
            }

            let firstPunchTime: string | null = null;
            let lastPunchTime: string | null = null;

            if (rawText) {
              // Usually format is "08:38、18:00" or "08:50" or multiple lines/commas
              const times = rawText.split(/[、,\s\n\r]+/).filter(t => t.match(/^\d{2}:\d{2}$/));
              if (times.length > 0) {
                firstPunchTime = times[0];
                lastPunchTime = times[times.length - 1]; // Can be the same as first if only one punch
              }
            }

            dailyRecords[dateNum] = {
              date: dateNum,
              firstPunchTime,
              lastPunchTime,
              rawText
            };
          }

          parsedRecords.push({
            employeeName,
            dailyRecords
          });
        }

        resolve(parsedRecords);

      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
