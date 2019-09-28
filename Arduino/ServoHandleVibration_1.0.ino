/*
 Controlling a servo position using a potentiometer (variable resistor)
 by Michal Rinott <http://people.interaction-ivrea.it/m.rinott>

 modified on 8 Nov 2013
 by Scott Fitzgerald
 http://www.arduino.cc/en/Tutorial/Knob
*/
//
#include <ArduinoJson.h>

#include <Servo.h>

Servo leftHandleServo;
Servo rightHandleServo; 

int direction= Serial.read();

void setup() {
  Serial.begin(115200);
 while (!Serial) continue;

  leftHandleServo.attach(9);
  rightHandleServo.attach(10);
}

void loop() {
  readInput();

if(direction == 1){
  rightHandleServo.write(180); 
  delay(500);  
  rightHandleServo.write(0); 
  delay(100);
  rightHandleServo.write(180); 
  delay(100); 
  rightHandleServo.write(0); 
  delay(100);  
};

if(direction == 2){
  leftHandleServo.write(180);        
  delay(500);  

  leftHandleServo.write(0); 
  delay(100);   
    
  leftHandleServo.write(180); 
  delay(100);   
     
  leftHandleServo.write(0); 
  delay(100);  
}
 
  
}
