const blockRule = /^(\${2})(?:\n)?((?:\\[^]|[^\\])+?)(?:\n)?\1(?:\n|$)/;

const testCases = [
  // 测试用例1：没有换行
  '$$\\begin{aligned} \\max S &= 1.414 \\\\ \\text{numerator} &= [e^{-0.707}] \\end{aligned}$$',
  
  // 测试用例2：有换行
  '$$\n\\begin{aligned} \\max S &= 1.414 \\end{aligned}\n$$',
  
  // 测试用例3：原始格式
  '$$\\begin{aligned} \\max S &= 1.414 \\\\  \\text{numerator} &= [e^{-0.707}, e^{-1.414}, e^{-0.707}, e^{0}] \\\\ &= [0.493, 0.243, 0.493, 1.0] \\\\  \\text{sum} &= 0.493 + 0.243 + 0.493 + 1.0 = 2.229 \n\\end{aligned}$$',
];

testCases.forEach((test, i) => {
  console.log(`\n测试用例 ${i + 1}:`);
  console.log('输入:', test.substring(0, 60) + '...');
  const match = test.match(blockRule);
  console.log('匹配结果:', match ? '✅ 成功' : '❌ 失败');
  if (match) {
    console.log('捕获组1 ($$):', match[1]);
    console.log('捕获组2 (内容):', match[2].substring(0, 50) + '...');
  }
});
