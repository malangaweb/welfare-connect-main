import 'dart:typed_data';
import 'package:excel/excel.dart';
import 'package:pdf/widgets.dart' as pdf;
import 'package:printing/printing.dart';
import 'package:intl/intl.dart';

String _timestamp() {
  final d = DateTime.now();
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}_${d.hour.toString().padLeft(2, '0')}${d.minute.toString().padLeft(2, '0')}';
}

String exportFilename(String base, String ext) => '${base}_${_timestamp()}.$ext';

Future<Uint8List> generateExcelFile({
  required String title,
  required List<String> headers,
  required List<List<dynamic>> rows,
}) async {
  final excel = Excel.createExcel();
  final sheet = excel['Report'];

  for (var c = 0; c < headers.length; c++) {
    sheet.cell(CellIndex.indexByString('${String.fromCharCode(65 + c)}1')).value = TextCellValue(headers[c]);
  }

  for (var r = 0; r < rows.length; r++) {
    for (var c = 0; c < headers.length; c++) {
      final value = c < rows[r].length ? rows[r][c] : '';
      sheet.cell(CellIndex.indexByString('${String.fromCharCode(65 + c)}${r + 2}')).value = TextCellValue(value.toString());
    }
  }

  final bytes = excel.save()!;
  return Uint8List.fromList(bytes);
}

Future<Uint8List> generatePdfFile({
  required String title,
  required List<String> headers,
  required List<List<dynamic>> rows,
  NumberFormat? money,
}) async {
  final pdfDoc = pdf.Document();

  final tableData = <List<String>>[
    headers,
    ...rows.map((row) => row.map((cell) {
      if (money != null && cell is num) {
        return money.format(cell);
      }
      return cell?.toString() ?? '';
    }).toList()),
  ];

  pdfDoc.addPage(
    pdf.Page(
      build: (pdf.Context context) => pdf.Column(
        crossAxisAlignment: pdf.CrossAxisAlignment.start,
        children: [
          pdf.Padding(
            padding: const pdf.EdgeInsets.all(16),
            child: pdf.Text(title, style: pdf.TextStyle(fontSize: 20, fontWeight: pdf.FontWeight.bold)),
          ),
          pdf.SizedBox(height: 16),
          pdf.TableHelper.fromTextArray(
            headers: tableData[0],
            data: tableData.length > 1 ? tableData.sublist(1) : [],
            cellAlignment: pdf.Alignment.topLeft,
            cellStyle: const pdf.TextStyle(fontSize: 10),
            headerStyle: pdf.TextStyle(fontSize: 12, fontWeight: pdf.FontWeight.bold),
          ),
        ],
      ),
    ),
  );

  return await pdfDoc.save();
}

Future<void> shareFile({
  required String title,
  required Uint8List bytes,
  required String ext,
}) async {
  await Printing.sharePdf(bytes: bytes, filename: '$title.$ext');
}