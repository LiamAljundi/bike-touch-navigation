/*
 Controlling a servo position using a potentiometer (variable resistor)
 by Michal Rinott <http://people.interaction-ivrea.it/m.rinott>

 modified on 8 Nov 2013
 by Scott Fitzgerald
 http://www.arduino.cc/en/Tutorial/Knob
*/
//
#include <Servo.h>

Servo leftHandleServo;
Servo rightHandleServo; 

void setup() {
  Serial.begin(9600);
  leftHandleServo.attach(9);
  rightHandleServo.attach(10);
}

void loop() {
  leftHandleServo.write(180);        
  delay(500);  
  rightHandleServo.write(180); 
  delay(500);  
  leftHandleServo.write(0); 
  delay(100);   
  rightHandleServo.write(0); 
  delay(100);  
  leftHandleServo.write(180); 
  delay(100);   
  rightHandleServo.write(180); 
  delay(100);    
  leftHandleServo.write(0); 
  delay(100);   
  rightHandleServo.write(0); 
  delay(100);  
}
