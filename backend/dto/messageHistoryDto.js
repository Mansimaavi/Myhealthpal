// dto/messageHistoryDto.js
class MessageHistoryDto {
  constructor(sender, content, sentiment) {
    this.sender = sender;
    this.content = content;
    this.sentiment = sentiment;
  }

  static fromEntity(message) {
    return new MessageHistoryDto(message.sender, message.content, message.sentiment);
  }

  toString() {
    return `sender='${this.sender}', content='${this.content}'`;
  }
}

export default MessageHistoryDto;
