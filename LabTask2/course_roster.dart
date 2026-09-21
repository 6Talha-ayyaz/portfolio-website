import 'dart:core';

/// Prints a decorative banner for the application.
void printWelcome(String appName) {
  print('=== $appName ===');
}

/// Generates a course code based on the title.
String generateCode(String title) {
  return title.substring(0, 2).toUpperCase() + '101';
}

/// Represents a console-based Course Roster Manager.
/// Demonstrates Dart fundamental concepts including data structures, 
/// null safety, and string manipulation.
void main() {
  // Part 1: Setup & Welcome
  printWelcome('Course Roster Manager');

  // Part 2: Course & Roster Data
  const int maxCapacity = 4;
  final DateTime createdAt = DateTime.now();
  String courseTitle = 'CS201: Mobile App Development';
  bool isOpen = true;
  int capacity = maxCapacity;
  List<String> enrolledStudents = ['Aiden', 'Maria', 'Jamal'];

  print('Course: $courseTitle | Capacity: $capacity | Enrolled: ${enrolledStudents.length}');

  // Part 3: Null-Safe Instructor Info
  String? instructorEmail;
  print('Instructor Email: ${instructorEmail ?? 'TBA'}');

  late String enrollmentCode;
  enrollmentCode = generateCode(courseTitle);
  print('Enrollment Code: $enrollmentCode');

  // Part 4: Formatting Strings
  String rawNames = ' Aiden , maria ,JAMAL , Priya ';
  List<String> cleanNames = rawNames.split(',').map((n) => n.trim()).toList();

  final String description = '''
Course Details:
Title: $courseTitle
Created At: $createdAt
Enrolled Names: ${cleanNames.join(', ')}
''';
  
  print(description);
  print('Seats left: ${capacity - enrolledStudents.length}');

  // Part 5: Operators in Action
  int fullGroups = enrolledStudents.length ~/ 3;
  int leftover = enrolledStudents.length % 3;
  print('Full lab groups: $fullGroups, Leftover students: $leftover');

  Object formInput = 'twenty-two';
  if (formInput is String) {
    print('Input is a string.');
  }
  if (formInput is! int) {
    print('Input is not an integer.');
  }

  final report = StringBuffer()
    ..write('Title: $courseTitle | ')
    ..write('Capacity: $capacity | ')
    ..write('Enrolled: ${enrolledStudents.length}');
  print('Report: ${report.toString()}');

  List<String>? extraNotes;
  extraNotes?..add('Room change pending');
  print('Extra notes after cascade: $extraNotes');

  int? bonusSeats;
  bonusSeats ??= 0;
  print('Bonus seats assigned: $bonusSeats');

  // Part 6: Enrollment Logic
  if (isOpen && enrolledStudents.length < capacity) {
    print('Enrollment successful: Student can join the class.');
  } else {
    print('Enrollment failed: Course is full or closed.');
  }

  int enrollmentStatusCode = 200;
  switch (enrollmentStatusCode) {
    case 200:
      print('Status: Enrolled');
      break;
    case 404:
      print('Status: Course not found');
      break;
    default:
      print('Status: Unknown error');
      break;
  }

  String statusTag = isOpen ? 'OPEN' : 'FULL';
  print('Current Status Tag: $statusTag');

  // Part 7: Reports & Loops
  final Map<String, int> attendanceCount = {
    'Aiden': 1,
    'Maria': 1,
    'Jamal': 1,
  };
  final List<String> waitlist = ['Priya', 'Sam'];

  // 1. for-in
  print('\n--- Full Roster ---');
  for (final student in enrolledStudents) {
    print(student);
  }

  // 2. forEach
  print('\n--- Attendance Records ---');
  attendanceCount.forEach((name, count) {
    print('$name: $count day(s)');
  });

  // 3. Collection literal with embedded if/for
  List<String> announcements = [
    'Welcome to $courseTitle',
    if (!isOpen) 'Course is FULL — waitlist open',
    for (var student in waitlist) 'Reminder: $student, please confirm attendance',
  ];

  print('\n--- Announcements ---');
  for (final msg in announcements) {
    print(msg);
  }
}