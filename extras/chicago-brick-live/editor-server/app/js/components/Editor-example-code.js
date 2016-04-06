// Example code segments
export const EXAMPLE_CODE = [
  {
    name: "Write Text",
    code:
`// Write text to screen at position x=50, y=100.
canvas.writeText(50, 100, "Hello!", "green");`
  }, {
    name: "Draw a circle",
    code:
`// Draw a blue circle with radius 80 at x=200, y=350.
canvas.draw.circle(200, 350, 80, "blue");`
  }, {
    name: "Draw a rectangle",
    code:
`// Draw a orange rectangle x=400, y=600.
var rect = {
  left: 400,
  top: 600,
  width: 100,
  height: 300,
};
canvas.draw.rectangle(rect, "orange");`
  },{
    name: "Draw an image",
    code:
`// Draw an image from a URL.
var url="https://www.google.com/maps/vt/data=RfCSdfNZ0LFPrHSm0ublXdzhdrDFhtmHhN1u-gM,ffz2Sht-qkgFQ4Ea6BKi8EFFPFoV9amyloiSC6vYaHgbypA-i5U46nmm3BLs0X9jpTZ7yeV2WdmudjjN-kbiqqa0wC2kaBcLNB4zB8cfgk9iDvE-07HZj_wfGj2TimZSuJZta1js8WQy7o394x6Zfd5QYDuqV7gt2SkLM72U6MyarCF7Syvp0pRUGEG7Y5E0SpFDg2BDy8lGI4KSifr7xu9d-g5waWegvmgjGkUXaIbvLP9xroYDytDX96Yv1p5VyrfJwRQZGgXsha4kIiNFIJIJIp_QIfGeUooh3NUlOkRq-dCMJPpWfN-fQk6CpENkDFu1IaOmR6I6PG2vBvHsbSHHJH3WKg4Igpf2aC0ayUpBEiTh6i67wnRi0rL964udLgtRfVejBLA0302RpB19KeMRrpEnzqvbkLMOtX_Zpbpg0KJOCNMdA_6CPV77eW7HcW_YvALZp_uVSbGDRyEUCS-QzbLiJ1PzmAvlqUrDCbpmiEvuXCx3n5K1CWXx2whH9-ULBQ7PmtxNbnECn9xn0aclpYhS1x1uOJ1E-xDj5Q0FadKR1gD3jbepEMfzGJDyIP_BjysQhi7RSj4nh8Ou6yLQ8pqn7UccP7ZJ";
canvas.draw.image(50, 100, url);`
  }, {
    name: "Draw a car",
    code:
`
// Define a function that can draw an entire car on the canvas.
var drawCar = function(x, y, color) {
  // Draw the car body using two rectangles.
  var carBottom = {
    left: x-225,
    top: y-75,
    width: 450,
    height: 75
  };

  var carTop = {
      left: x-175,
      top: y-150,
      width: 250,
      height: 75
  };

  canvas.draw.rectangle(carTop, color);
  canvas.draw.rectangle(carBottom, color);

  // Draw a window with another rectangle.
  var window = {
    left: x-15,
    top: y-140,
    width: 75,
    height: 50
  };
  canvas.draw.rectangle(window, "lightblue");

  // Draw wheels
  canvas.draw.circle(x-150, y, 50, "gray");
  canvas.draw.circle(x-150, y, 45, "white");
  canvas.draw.circle(x+150, y, 50, "gray");
  canvas.draw.circle(x+150, y, 45, "white");
}

// Here is a car the does not move.
drawCar(500, 900, 'orange');
// Here is a car that drives across the screen.
drawCar((time % 2800) - 500, 600, 'blue');
`
  },
];
