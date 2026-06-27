import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

class BarChartCard extends StatelessWidget {
  final String title;
  final List<double> values;
  final List<String> labels;
  final Color color;

  const BarChartCard({
    super.key,
    required this.title,
    required this.values,
    required this.labels,
    this.color = const Color(0xFF1F3556),
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
            const SizedBox(height: 12),
            SizedBox(
              height: 200,
              child: BarChart(
                BarChartData(
                  alignment: BarChartAlignment.spaceBetween,
                  barTouchData: BarTouchData(enabled: true),
                  titlesData: FlTitlesData(
                    show: true,
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        getTitlesWidget: (value, meta) {
                          final index = value.toInt();
                          if (index >= 0 && index < labels.length) {
                            return Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(labels[index], style: const TextStyle(fontSize: 10)),
                            );
                          }
                          return const Text('');
                        },
                      ),
                    ),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(showTitles: true, reservedSize: 40),
                    ),
                  ),
                  gridData: FlGridData(show: true, drawHorizontalLine: true, drawVerticalLine: false),
                  barGroups: values.asMap().entries.map((e) {
                    return BarChartGroupData(
                      x: e.key,
                      barRods: [
                        BarChartRodData(
                          toY: e.value,
                          width: 20,
                          color: color,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ],
                    );
                  }).toList(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class PieChartCard extends StatelessWidget {
  final String title;
  final List<Map<String, dynamic>> data;
  final Color baseColor;

  const PieChartCard({
    super.key,
    required this.title,
    required this.data,
    this.baseColor = const Color(0xFF1F3556),
  });

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
              const SizedBox(height: 12),
              const SizedBox(height: 200, child: Center(child: Text('No data available'))),
            ],
          ),
        ),
      );
    }

    final colors = [
      const Color(0xFF1F3556),
      const Color(0xFF39D088),
      const Color(0xFFFC5100),
      const Color(0xFF49D1E3),
      const Color(0xFFFF6B6B),
      const Color(0xFF829DFF),
    ];

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
            const SizedBox(height: 12),
            SizedBox(
              height: 200,
              child: PieChart(
                PieChartData(
                  sections: data.asMap().entries.map((e) {
                    final value = (e.value['value'] as num?)?.toDouble() ?? 0;
                    return PieChartSectionData(
                      value: value,
                      title: '${e.value['label'] ?? ''}\n${value.toInt()}',
                      color: colors[e.key % colors.length],
                      radius: 50,
                      titleStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
                    );
                  }).toList(),
                  centerSpaceRadius: 30,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              children: data.asMap().entries.map((e) {
                final color = colors[e.key % colors.length];
                final value = (e.value['value'] as num?)?.toDouble() ?? 0;
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(width: 12, height: 12, color: color),
                    Text('${e.value['label'] ?? ''} ($value)', style: const TextStyle(fontSize: 12)),
                  ],
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class AreaChartCard extends StatelessWidget {
  final String title;
  final List<Map<String, dynamic>> data;
  final Color color;

  const AreaChartCard({
    super.key,
    required this.title,
    required this.data,
    this.color = const Color(0xFF1F3556),
  });

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
              const SizedBox(height: 12),
              const SizedBox(height: 200, child: Center(child: Text('No data available'))),
            ],
          ),
        ),
      );
    }

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
            const SizedBox(height: 12),
            SizedBox(
              height: 200,
              child: LineChart(
                LineChartData(
                  minX: 0,
                  maxX: (data.length - 1).toDouble(),
                  minY: 0,
                  lineTouchData: LineTouchData(enabled: true),
                  gridData: FlGridData(show: true, drawHorizontalLine: true, drawVerticalLine: false),
                  titlesData: FlTitlesData(
                    show: true,
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        getTitlesWidget: (value, meta) {
                          final index = value.toInt();
                          if (index >= 0 && index < data.length) {
                            return Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text('${data[index]['label'] ?? ''}', style: const TextStyle(fontSize: 10)),
                            );
                          }
                          return const Text('');
                        },
                      ),
                    ),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(showTitles: true, reservedSize: 40),
                    ),
                  ),
                  borderData: FlBorderData(show: true),
                  lineBarsData: [
                    LineChartBarData(
                      spots: data.asMap().entries.map((e) {
                        final value = (e.value['value'] as num?)?.toDouble() ?? 0;
                        return FlSpot(e.key.toDouble(), value);
                      }).toList(),
                      isCurved: true,
                      color: color,
                      barWidth: 3,
                      belowBarData: BarAreaData(
                        show: true,
                        color: color.withValues(alpha: 0.3),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}