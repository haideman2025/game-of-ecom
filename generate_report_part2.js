const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, WidthType, BorderStyle, ShadingType, HeadingLevel, PageBreak } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerShading = { fill: "4472C4", type: ShadingType.CLEAR };

const createTableCell = (text, width, isHeader = false) => {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: isHeader ? headerShading : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({
        text: text,
        bold: isHeader,
        color: isHeader ? "FFFFFF" : "000000",
        font: "Arial",
        size: 22
      })]
    })]
  });
};

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "2E5090" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "4472C4" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 }
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("III. PHÂN TÍCH CHIẾN LƯỢC ĐÒNG BẨY TÀI CHÍNH")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("3.1. Mô tả vòng xoáy đòn bẩy (Leverage Cycle)")]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Chiến lược đòn bẩy tài chính hoạt động theo một chu kỳ ba giai đoạn liên tục, tạo ra một vòng xoáy tự duy trì tăng trưởng tài chính. Mô hình này lợi dụng mối quan hệ giữa doanh thu, tài sản, và chi phí vốn để gia tăng khả năng huy động vốn.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("3.2. Giai đoạn 1: Doanh thu và hàng hóa → Vay → Mua BĐS")]
      }),

      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Quá trình khởi động:",
          bold: true,
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Công ty sử dụng doanh thu hàng tháng (5 tỷ VND) và hàng tồn kho (inventory) làm tài sản thế chấp",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Tiếp cận các ngân hàng hoặc tổ chức tài chính để vay vốn dựa trên dòng tiền và hàng hóa",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Lãi suất vay lúc này: 10-12% (tương đối cao vì dựa trên dòng tiền ngắn hạn)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Vốn vay được dùng để mua các bất động sản chiến lược (văn phòng, kho hàng, hoặc đất nền)",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("3.3. Giai đoạn 2: BĐS vào tài sản công ty → Thế chấp → Vay SXKD")]
      }),

      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Tối ưu hóa cấu trúc vốn:",
          bold: true,
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Bất động sản được đăng ký vào danh sách tài sản cố định của công ty",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Sử dụng BĐS (với SĐKR - Sổ đăng ký và sổ hồng) làm tài sản thế chấp cho các khoản vay mới",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Lãi suất thế chấp BĐS thấp hơn: ~8% (vì BĐS là tài sản vật chất có giá trị ổn định)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Vốn vay từ BĐS được dùng cho chi phí sản xuất, nhập khẩu hàng hóa, và hoạt động SXKD",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("3.4. Giai đoạn 3: Tái đầu tư và mở rộng")]
      }),

      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Vòng xoáy tái tạo:",
          bold: true,
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Với vốn sinh hoạt tăng (từ vay BĐS), công ty tăng sản xuất và nhập khẩu hàng hóa cosmetics",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Doanh thu tăng → Dòng tiền mạnh hơn",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Tăng khả năng trả nợ và khả năng huy động vốn mới",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Quay lại Giai đoạn 1: Mua thêm BĐS, rồi thế chấp để vay tiếp → Vòng xoáy lặp lại",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("3.5. Bảng so sánh chi phí vốn")]
      }),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({
            children: [
              createTableCell("Loại tài sản thế chấp", 3120, true),
              createTableCell("Lãi suất", 3120, true),
              createTableCell("Kỳ hạn vay", 3120, true)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Dòng tiền/Inventory", 3120, false),
              createTableCell("12-15%", 3120, false),
              createTableCell("1-6 tháng", 3120, false)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Không thế chấp (unsecured)", 3120, false),
              createTableCell("12-15%", 3120, false),
              createTableCell("1-3 tháng", 3120, false)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Bất động sản (BĐS)", 3120, false),
              createTableCell("~8%", 3120, false),
              createTableCell("1-3 năm", 3120, false)
            ]
          })
        ]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("3.6. Phương án Liên doanh (Joint Venture)")]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Ngoài vòng xoáy đòn bẩy, công ty cũng cân nhắc liên doanh (joint venture) với các đối tác chiến lược. Phương án này có thể giúp chia sẻ rủi ro, tiếp cận thêm vốn, và mở rộng thị trường. Tuy nhiên, cần cân nhắc kỹ việc chia cổ phần, quản lý chung, và định hướng chiến lược.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({ children: [new PageBreak()] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/sessions/clever-intelligent-pasteur/mnt/DEMAN/Phan_Tich_Tai_Chinh_Deman_Oniiz_Part2.docx", buffer);
  console.log("Part 2 created successfully");
});
