const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, WidthType, BorderStyle, ShadingType, HeadingLevel, PageBreak, LevelFormat } = require('docx');
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
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "numbers",
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
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
      // COVER PAGE
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 400 },
        children: [new TextRun({ text: "CÔNG TY DEMAN", bold: true, size: 36, font: "Arial" })]
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
        children: [new TextRun({ text: "Thương hiệu: ONIIZ", bold: true, size: 28, font: "Arial", color: "4472C4" })]
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 600 },
        children: [new TextRun({ text: "PHÂN TÍCH CHIẾN LƯỢC ĐÒNG BẨY TÀI CHÍNH", bold: true, size: 32, font: "Arial", color: "2E5090" })]
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: "Tái cấu trúc tài chính và mở rộng kinh doanh", size: 24, font: "Arial", italic: true })]
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 },
        children: [new TextRun({ text: "Ngày chuẩn bị: 17 tháng 4, năm 2026", size: 22, font: "Arial" })]
      }),
      new Paragraph({ children: [new PageBreak()] }),

      // SECTION I
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("I. TÓM TẮT ĐIỀU HÀNH")] }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Chiến lược đòn bẩy tài chính được đề xuất nhằm tối ưu hóa cấu trúc vốn và gia tăng khả năng mở rộng kinh doanh của Công ty Deman (thương hiệu Oniiz). Chiến lược này lợi dụng chu kỳ tái đầu tư bất động sản (BĐS) để tạo ra một vòng xoáy tài chính bền vững, cho phép công ty:", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Giảm chi phí vốn từ 12-15% xuống 8% thông qua việc sử dụng BĐS làm tài sản thế chấp", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Tích lũy tài sản dài hạn có giá trị gia tăng (BĐS)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Tăng năng lực sản xuất và nhập khẩu hàng hóa cosmetics/personal care", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Đa dạng hóa danh mục đầu tư vào lĩnh vực bất động sản", font: "Arial", size: 22 })]
      }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Tuy nhiên, chiến lược này đồng thời kéo theo những rủi ro đáng kể liên quan đến biến động thị trường BĐS, rủi ro lãi suất, và mối nguy hiểm từ đòn bẩy tài chính quá cao. Báo cáo này phân tích chi tiết từng giai đoạn của vòng xoáy, đánh giá ưu điểm và nhược điểm, và đưa ra khuyến nghị cụ thể để thực hiện chiến lược một cách an toàn.", font: "Arial", size: 22 })]
      }),
      new Paragraph({ children: [new PageBreak()] }),

      // SECTION II
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("II. PHÂN TÍCH HIỆN TRẠNG TÀI CHÍNH")] }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Công ty Deman hiện đạt doanh thu hàng tháng trên 5 tỷ VND, tương đương ~60 tỷ VND/năm. Công ty chuyên sản xuất và phân phối các sản phẩm mỹ phẩm và chăm sóc cá nhân, bao gồm:", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Nước hoa (Eau de Parfum, Eau de Toilette)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Bọt rửa mặt và sản phẩm chăm sóc da", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Xịt thơm phòng (Room spray)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Gối, tấm, và các sản phẩm hỗ trợ giấc ngủ", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Bộ vệ sinh (BVS) và các sản phẩm khác", font: "Arial", size: 22 })]
      }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Điều kiện tài chính hiện tại:")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Với doanh thu ổn định và tăng trưởng liên tục, Công ty Deman có nền tảng tài chính vững chắc để huy động vốn vay. Hiện tại, công ty có thể tiếp cận vốn vay dựa trên doanh thu và hàng tồn kho, nhưng chi phí vốn tương đối cao (12-15%). Chiến lược đề xuất nhằm tối ưu hóa cấu trúc này.", font: "Arial", size: 22 })]
      }),

      // SECTION III
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("III. PHÂN TÍCH CHIẾN LƯỢC ĐÒNG BẨY TÀI CHÍNH")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.1. Mô tả vòng xoáy đòn bẩy (Leverage Cycle)")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Chiến lược đòn bẩy tài chính hoạt động theo một chu kỳ ba giai đoạn liên tục, tạo ra một vòng xoáy tự duy trì tăng trưởng tài chính. Mô hình này lợi dụng mối quan hệ giữa doanh thu, tài sản, và chi phí vốn để gia tăng khả năng huy động vốn.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.2. Giai đoạn 1: Doanh thu và hàng hóa → Vay → Mua BĐS")] }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Quá trình khởi động:", bold: true, font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Công ty sử dụng doanh thu hàng tháng (5 tỷ VND) và hàng tồn kho (inventory) làm tài sản thế chấp", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Tiếp cận các ngân hàng hoặc tổ chức tài chính để vay vốn dựa trên dòng tiền và hàng hóa", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Lãi suất vay lúc này: 10-12% (tương đối cao vì dựa trên dòng tiền ngắn hạn)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Vốn vay được dùng để mua các bất động sản chiến lược (văn phòng, kho hàng, hoặc đất nền)", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.3. Giai đoạn 2: BĐS vào tài sản công ty → Thế chấp → Vay SXKD")] }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Tối ưu hóa cấu trúc vốn:", bold: true, font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Bất động sản được đăng ký vào danh sách tài sản cố định của công ty", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Sử dụng BĐS (với SĐKR - Sổ đăng ký và sổ hồng) làm tài sản thế chấp cho các khoản vay mới", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Lãi suất thế chấp BĐS thấp hơn: ~8% (vì BĐS là tài sản vật chất có giá trị ổn định)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Vốn vay từ BĐS được dùng cho chi phí sản xuất, nhập khẩu hàng hóa, và hoạt động SXKD", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.4. Giai đoạn 3: Tái đầu tư và mở rộng")] }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Vòng xoáy tái tạo:", bold: true, font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Với vốn sinh hoạt tăng (từ vay BĐS), công ty tăng sản xuất và nhập khẩu hàng hóa cosmetics", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Doanh thu tăng → Dòng tiền mạnh hơn", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Tăng khả năng trả nợ và khả năng huy động vốn mới", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Quay lại Giai đoạn 1: Mua thêm BĐS, rồi thế chấp để vay tiếp → Vòng xoáy lặp lại", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.5. Bảng so sánh chi phí vốn")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [
            createTableCell("Loại tài sản thế chấp", 3120, true),
            createTableCell("Lãi suất", 3120, true),
            createTableCell("Kỳ hạn vay", 3120, true)
          ]}),
          new TableRow({ children: [
            createTableCell("Dòng tiền/Inventory", 3120, false),
            createTableCell("12-15%", 3120, false),
            createTableCell("1-6 tháng", 3120, false)
          ]}),
          new TableRow({ children: [
            createTableCell("Không thế chấp (unsecured)", 3120, false),
            createTableCell("12-15%", 3120, false),
            createTableCell("1-3 tháng", 3120, false)
          ]}),
          new TableRow({ children: [
            createTableCell("Bất động sản (BĐS)", 3120, false),
            createTableCell("~8%", 3120, false),
            createTableCell("1-3 năm", 3120, false)
          ]})
        ]
      }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.6. Phương án Liên doanh (Joint Venture)")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Ngoài vòng xoáy đòn bẩy, công ty cũng cân nhắc liên doanh (joint venture) với các đối tác chiến lược. Phương án này có thể giúp chia sẻ rủi ro, tiếp cận thêm vốn, và mở rộng thị trường. Tuy nhiên, cần cân nhắc kỹ việc chia cổ phần, quản lý chung, và định hướng chiến lược.", font: "Arial", size: 22 })]
      }),
      new Paragraph({ children: [new PageBreak()] }),

      // SECTION IV
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("IV. ĐÁNH GIÁ ƯU ĐIỂM")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.1. Tối ưu hóa chi phí vốn")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Giảm lãi suất vay từ 12-15% (dòng tiền/inventory) xuống 8% (BĐS) sẽ tiết kiệm chi phí tài chính đáng kể. Ví dụ: Vay 1 tỷ VND trong 1 năm: Lãi suất 12%: 120 triệu VND lãi; Lãi suất 8%: 80 triệu VND lãi → Tiết kiệm 40 triệu VND/năm.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.2. Tích lũy tài sản dài hạn")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Bất động sản thường có tính tăng giá theo thời gian (đặc biệt ở thị trường Việt Nam). Bằng cách thế chấp BĐS để vay và tái đầu tư, công ty vừa có vốn sinh hoạt vừa tích lũy tài sản có giá trị gia tăng dài hạn.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.3. Tăng năng lực tài chính doanh nghiệp")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Vốn sinh hoạt tăng cho phép công ty mở rộng sản xuất, nhập khẩu hàng hóa, và thâm nhập thị trường mới. Điều này sẽ tăng doanh thu và khả năng trả nợ.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.4. Đa dạng hóa danh mục đầu tư")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Ngoài kinh doanh cosmetics, công ty có thêm nguồn doanh thu từ BĐS (cho thuê, bán), giảm rủi ro phụ thuộc hoàn toàn vào một lĩnh vực.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION V
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("V. ĐÁNH GIÁ RỦI RO VÀ NHƯỢC ĐIỂM")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.1. Rủi ro thị trường bất động sản")] }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Vấn đề chính:", bold: true, font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Giá BĐS có thể giảm do biến động thị trường, khủng hoảng kinh tế, hoặc thay đổi chính sách", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Nếu giá BĐS giảm, giá trị tài sản thế chấp cũng giảm → Ngân hàng có thể yêu cầu bổ sung tài sản thế chấp", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Trong trường hợp xấu, công ty có thể mất BĐS nếu không trả nợ", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.2. Rủi ro lãi suất biến động")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Lãi suất 8% được giả định dựa trên điều kiện thị trường hiện tại. Nếu lãi suất tăng (ví dụ lên 10-12%), chi phí vốn sẽ tăng và làm giảm lợi nhuận. Công ty cần cân nhắc rủi ro này và có thể khóa lãi suất cố định qua hợp đồng dài hạn.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.3. Rủi ro thanh khoản")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Nếu doanh thu cosmetics giảm đột ngột (do thay đổi xu hướng tiêu dùng, cạnh tranh, hoặc khủng hoảng kinh tế), công ty sẽ gặp khó khăn trong việc trả nợ. Vòng xoáy đòn bẩy sẽ lật ngược.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.4. Rủi ro pháp lý và quyền sở hữu")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Cần đảm bảo pháp lý chặt chẽ cho tài sản thế chấp: Sổ đăng ký (SĐKR) và sổ hồng phải rõ ràng, không tranh chấp.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.5. Rủi ro từ đòn bẩy tài chính quá cao")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Đòn bẩy tài chính (D/E ratio) quá cao làm tăng mối nguy vỡ nợ. Công ty cần giữ D/E ratio ở mức an toàn (ví dụ dưới 2:1).", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.6. Mất tập trung vào ngành chính")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Việc quản lý BĐS song song với kinh doanh cosmetics sẽ tốn thời gian và tài nguyên quản lý.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION VI
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("VI. PHÂN TÍCH KỊCH BẢN")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("6.1. Kịch bản Lạc quan")] }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Giả định: Giá BĐS tăng 10-15% hàng năm; Doanh thu cosmetics tăng 20% hàng năm; Lãi suất vay ổn định ở 8%", bold: true, font: "Arial", size: 22 })]
      }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Kết quả: Vòng xoáy tự duy trì tốt. Tài sản BĐS gia tăng giá trị, doanh thu cosmetics đạt 72 tỷ VND/năm.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("6.2. Kịch bản Trung bình")] }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Giả định: Giá BĐS ổn định hoặc tăng 5% hàng năm; Doanh thu cosmetics tăng 8-10%; Lãi suất tăng lên 9-10%", bold: true, font: "Arial", size: 22 })]
      }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Kết quả: Vòng xoáy tiếp tục nhưng tốc độ chậm hơn. Doanh thu cosmetics đạt 64-66 tỷ VND/năm.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("6.3. Kịch bản Xấu")] }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Giả định: Giá BĐS giảm 10-20%; Doanh thu cosmetics giảm 15-20%; Lãi suất tăng lên 11-12%", bold: true, font: "Arial", size: 22 })]
      }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Kết quả: Vòng xoáy lật ngược. Doanh thu cosmetics giảm xuống 48-51 tỷ VND/năm. Công ty rơi vào tình trạng khủng hoảng.", font: "Arial", size: 22 })]
      }),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 2340, 2340, 2340],
        rows: [
          new TableRow({ children: [
            createTableCell("Yếu tố", 2340, true),
            createTableCell("Lạc quan", 2340, true),
            createTableCell("Trung bình", 2340, true),
            createTableCell("Xấu", 2340, true)
          ]}),
          new TableRow({ children: [
            createTableCell("Tăng trưởng BĐS", 2340, false),
            createTableCell("10-15%/năm", 2340, false),
            createTableCell("5%/năm", 2340, false),
            createTableCell("-10-20%", 2340, false)
          ]}),
          new TableRow({ children: [
            createTableCell("Tăng trưởng doanh thu", 2340, false),
            createTableCell("20%/năm", 2340, false),
            createTableCell("8-10%/năm", 2340, false),
            createTableCell("-15-20%", 2340, false)
          ]}),
          new TableRow({ children: [
            createTableCell("Lãi suất", 2340, false),
            createTableCell("8%", 2340, false),
            createTableCell("9-10%", 2340, false),
            createTableCell("11-12%", 2340, false)
          ]}),
          new TableRow({ children: [
            createTableCell("Doanh thu năm 1", 2340, false),
            createTableCell("72 tỷ VND", 2340, false),
            createTableCell("64-66 tỷ", 2340, false),
            createTableCell("48-51 tỷ", 2340, false)
          ]}),
          new TableRow({ children: [
            createTableCell("Tình trạng", 2340, false),
            createTableCell("Tuyệt vời", 2340, false),
            createTableCell("Ổn định", 2340, false),
            createTableCell("Khủng hoảng", 2340, false)
          ]})
        ]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION VII
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("VII. PHƯƠNG ÁN LIÊN DOANH (JOINT VENTURE)")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Ngoài chiến lược đòn bẩy tài chính nội bộ, công ty có thể cân nhắc liên doanh với các đối tác chiến lược. Lợi ích của JV:", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Chia sẻ vốn: Đối tác cung cấp thêm vốn → Giảm áp lực nợ", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Chia sẻ rủi ro: Nếu kinh doanh gặp khó khăn, rủi ro được chia với đối tác", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Kỹ thuật & kinh nghiệm: Tiếp cận công nghệ, thị trường, mạng lưới của đối tác", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Tăng tính minh bạch: JV thường có quản lý chuyên nghiệp hơn", font: "Arial", size: 22 })]
      }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Tuy nhiên, JV cũng có nhược điểm: Mất quyền tự chủ, phải chia lợi nhuận, có thể xảy ra xung đột lợi ích với đối tác.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION VIII
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("VIII. KHUYẾN NGHỊ VÀ LỘ TRÌNH THỰC HIỆN")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("8.1. Nguyên tắc an toàn tài chính")] }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Giới hạn tỷ lệ Nợ/Vốn (D/E ratio) ≤ 2:1. Nợ không vượt quá 2 lần Vốn chủ sở hữu.", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Dự phòng rủi ro: Dành 10-15% lợi nhuận hàng năm vào quỹ dự phòng", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Thanh khoản: Luôn giữ quỹ lưu động tối thiểu 2-3 tháng chi phí hoạt động", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Lãi suất cố định: Khóa lãi suất dài hạn (1-3 năm) để tránh biến động", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("8.2. Lộ trình thực hiện 3 giai đoạn")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 3510, 3510],
        rows: [
          new TableRow({ children: [
            createTableCell("Giai đoạn", 2340, true),
            createTableCell("Thời gian", 3510, true),
            createTableCell("Nội dung chính", 3510, true)
          ]}),
          new TableRow({ children: [
            createTableCell("Giai đoạn 1", 2340, false),
            createTableCell("0-6 tháng", 3510, false),
            createTableCell("Chuẩn bị pháp lý; Mua BĐS đầu tiên; Vay theo collateral inventory", 3510, false)
          ]}),
          new TableRow({ children: [
            createTableCell("Giai đoạn 2", 2340, false),
            createTableCell("6-12 tháng", 3510, false),
            createTableCell("Đăng ký BĐS; Thế chấp BĐS; Vay vốn SXKD; Mở rộng sản xuất", 3510, false)
          ]}),
          new TableRow({ children: [
            createTableCell("Giai đoạn 3", 2340, false),
            createTableCell("12-24 tháng", 3510, false),
            createTableCell("Tái đầu tư BĐS; Tăng doanh thu; Trả nợ; Lặp lại vòng", 3510, false)
          ]})
        ]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("8.3. KPIs theo dõi")] }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Doanh thu hàng tháng (target: tăng 1-2% hàng tháng)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "D/E ratio (target: ≤ 2:1)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Giá trị BĐS sở hữu (target: tăng 5-10% hàng năm)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Tỷ suất lợi nhuận ròng (target: ≥ 15%)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Khả năng thanh toán (Current Ratio, target: ≥ 1.5)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Thời gian trả nợ (Debt Service Coverage Ratio, target: > 2.0)", font: "Arial", size: 22 })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION IX
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("IX. KẾT LUẬN")] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Chiến lược đòn bẩy tài chính đưa ra cho Công ty Deman là một cách tiếp cận tích cực và thực tế để gia tăng khả năng tài chính và mở rộng kinh doanh. Nó lợi dụng dòng tiền ổn định của công ty và xu hướng tăng giá bất động sản để tạo ra một vòng xoáy tự duy trì tăng trưởng.", font: "Arial", size: 22 })]
      }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Tuy nhiên, thành công của chiến lược này phụ thuộc rất nhiều vào:", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Sự ổn định và tăng trưởng của doanh số cosmetics", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Tình trạng thị trường bất động sản", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Biến động lãi suất", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Quản lý rủi ro chặt chẽ và kỷ luật tài chính", font: "Arial", size: 22 })]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Khuyến nghị chính:", bold: true, font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Bắt đầu nhỏ: Mua BĐS thứ 1 trị giá ~2-3 tỷ VND (khoảng 3-6 tháng doanh thu)", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Đảm bảo pháp lý: Chuẩn bị hợp đồng, sổ đỏ, SĐKR chắc chắn trước khi vay", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Quản lý nợ: Theo dõi chặt D/E ratio, không vượt quá 2:1", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Duy trì dòng tiền: Không dùng toàn bộ doanh thu để trả nợ, cần có quỹ dự phòng 10-15%", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Xem xét JV: Nếu muốn giảm rủi ro, có thể tìm đối tác liên doanh", font: "Arial", size: 22 })]
      }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 240 }, children: [new TextRun({ text: "Theo dõi KPIs: Hàng tháng/quý, kiểm tra doanh thu, D/E, giá BĐS, lợi nhuận", font: "Arial", size: 22 })]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Tóm lại, chiến lược này là khả thi và có tiềm năng cao để gia tăng giá trị công ty nếu được thực hiện một cách thận trọng và có kỷ luật. Công ty Deman nên tiến hành chi tiết hơn với phân tích tài chính chuyên sâu, lên kế hoạch cụ thể, và tìm kiếm sự hỗ trợ từ các chuyên gia tài chính trước khi bắt đầu thực hiện.", font: "Arial", size: 22 })]
      })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/sessions/clever-intelligent-pasteur/mnt/DEMAN/Phan_Tich_Tai_Chinh_Deman_Oniiz.docx", buffer);
  console.log("Comprehensive report created successfully!");
});
