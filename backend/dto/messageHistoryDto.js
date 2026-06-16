// dto/messageHistoryDto.js
class MessageHistoryDto {
  constructor(sender, content) {
    this.sender = sender;
    this.content = content;
  }

  static fromEntity(message) {
    return new MessageHistoryDto(message.sender, message.content);
  }

  toString() {
    return `sender='${this.sender}', content='${this.content}'`;
  }
}

export default MessageHistoryDto;
