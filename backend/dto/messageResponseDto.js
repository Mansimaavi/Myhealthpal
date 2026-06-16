// dto/messageResponseDto.js
class MessageResponseDto {
  constructor(userMessage, gptResponse) {
    this.userMessage = userMessage;
    this.gptResponse = gptResponse;
  }
}

export default MessageResponseDto;
