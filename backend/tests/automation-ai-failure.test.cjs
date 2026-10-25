const {test}=require('node:test');
const assert=require('node:assert/strict');
const {automationAiFailureReason}=require('../dist/services/automation-logic');
const fail=(statusCode,message)=>Object.assign(new Error(message),{statusCode});

test('unavailable AI model is distinct from an unsafe generated reply',()=>{
  const result=automationAiFailureReason(fail(400,'This model models/gemini-old is no longer available to new users. secret-key https://private.example'));
  assert.match(result,/modelo de IA configurado não está disponível/);
  assert.match(result,/Nenhuma resposta foi enviada/);
  assert.doesNotMatch(result,/secret-key|private\.example|gemini-old/);
});
test('AI quota and timeout errors remain actionable without raw provider details',()=>{
  assert.match(automationAiFailureReason(fail(429,'key=secret')),/limite de uso/);
  assert.match(automationAiFailureReason(fail(504,'private request')),/demorou demais/);
});
test('AI credentials and configuration failures never expose provider messages',()=>{
  for(const status of [400,401,403,503]){
    const result=automationAiFailureReason(fail(status,'customer text and credentials'));
    assert.match(result,/Configurações > Inteligência artificial/);
    assert.doesNotMatch(result,/customer text|credentials/);
  }
});
test('unknown AI failures keep safe handoff and never expose data',()=>{
  for(const error of [null,undefined,'secret',new Error('sensitive response'),{statusCode:502,message:'secret'}]){
    assert.equal(automationAiFailureReason(error),'A IA não gerou uma resposta segura. Revise manualmente.');
  }
});
